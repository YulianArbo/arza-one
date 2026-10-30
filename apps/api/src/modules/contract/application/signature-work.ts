import { createHash, randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';

import { SIGNATURE_RULES } from '@arza/contracts';

import type { SigSigner } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { companyIdentity } from '../../core/index.js';
import { openAvailableFile, storeGeneratedPdf, type FileStorage } from '../../doc/index.js';
import { newSignatureCode } from '../domain/signature-rules.js';
import type { ContractHtml } from './contract-document.js';
import { systemActor } from './contract-support.js';
import { evidencePages, signatureEvidence, verifyUrl } from './signature-document.js';
import {
  codeMail,
  linkMail,
  signingUrl,
  type LinkMailKind,
  type SignatureMail,
} from './signature-mail.js';
import { codeHashOf } from './signature-public.js';
import {
  appendSignatureEvent,
  auditSignature,
  findEnvelope,
  type EnvelopeWithSigners,
} from './signature-records.js';
import { putDocumentInForce } from './signature-seal.js';

// Trabajo de la firma electrónica en el worker (B25). Cada pocos segundos: los correos con enlace
// (invitación, recordatorio, copia final), los códigos pedidos y el documento firmado de cada proceso
// que terminó. Cada día: los recordatorios y el vencimiento de los procesos fuera de plazo. Repetirlo
// no cambia nada, porque solo toma lo pendiente. La revisión diaria está en signature-follow-up.ts. Si el correo, Gotenberg o el almacenamiento no
// responden, lo pendiente queda para la siguiente pasada.

export interface SignatureWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete' | 'stream'>;
  readonly convertHtml: (document: ContractHtml) => Promise<Buffer>;
  readonly mergePdfs: (pdfs: readonly Buffer[]) => Promise<Buffer>;
  readonly mailer: { send(message: SignatureMail): Promise<void> };
  /** Dirección de la aplicación (APP_URL): los enlaces van a su mismo dominio. */
  readonly appUrl: string;
}

export interface SignatureWorkResult {
  readonly emails: number;
  readonly codes: number;
  readonly sealed: number;
}

const BATCH = 25;

export function scopeOf(tenantId: string): { tenantId: string; userId: null } {
  return { tenantId, userId: null };
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function bufferOf(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/** Lo que vale el enlace: hasta el plazo del proceso o, la copia final, 30 días. */
function linkExpiry(kind: LinkMailKind, expiresAt: Date, at: Date): Date {
  return kind === 'copy'
    ? new Date(at.getTime() + SIGNATURE_RULES.copyDays * 86_400_000)
    : expiresAt;
}

const LINK_EVENTS = { invitation: 'invited', reminder: 'reminded', copy: 'copy_sent' } as const;

/** Lo que hace el worker también queda en la auditoría, a nombre del sistema (ADR-012). */
async function auditWork(
  tx: TenantTransaction,
  at: Date,
  action: string,
  signer: Pick<SigSigner, 'id' | 'tenantId' | 'envelopeId'>,
  changes: Record<string, string> = {},
): Promise<void> {
  const envelope = await findEnvelope(tx, signer.envelopeId);
  const actor = systemActor(signer.tenantId, at);
  await auditSignature(tx, actor, action, envelope, { signer_id: signer.id, ...changes });
}

/** Prepara el enlace nuevo y su correo; null si el firmante ya no espera ese correo. */
async function prepareLinkMail(
  tx: TenantTransaction,
  deps: SignatureWorkDependencies,
  signer: SigSigner,
  at: Date,
): Promise<SignatureMail | null> {
  const kind = signer.mailPending as LinkMailKind | null;
  if (kind === null) return null;
  const envelope = await findEnvelope(tx, signer.envelopeId);
  const token = randomBytes(32).toString('base64url');
  await tx.sigSigner.update({
    where: { id: signer.id },
    data: { linkTokenHash: sha256(token), linkExpiresAt: linkExpiry(kind, envelope.expiresAt, at) },
  });
  await auditWork(tx, at, 'signature.link.issue', signer, { kind });
  return linkMail({
    kind,
    envelope,
    signer,
    company: await companyIdentity(tx),
    url: signingUrl(deps.appUrl, token),
    verifyUrl: verifyUrl(deps.appUrl),
  });
}

/** Correo con enlace: si falla después de enviar, la pasada siguiente manda otro enlace. */
async function sendLinkMail(deps: SignatureWorkDependencies, tenantId: string, signerId: string) {
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const signer = await tx.sigSigner.findFirst({
      where: { id: signerId, mailPending: { not: null }, deletedAt: null },
    });
    if (signer === null) return null;
    const mail = await prepareLinkMail(tx, deps, signer, deps.clock.now());
    return mail === null ? null : { mail, kind: signer.mailPending as LinkMailKind };
  });
  if (prepared === null) return false;
  await deps.mailer.send(prepared.mail);
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const signer = await tx.sigSigner.findFirst({ where: { id: signerId } });
    if (signer?.mailPending !== prepared.kind) return false;
    await tx.sigSigner.update({
      where: { id: signerId },
      data: {
        mailPending: null,
        lastNotifiedAt: at,
        ...(prepared.kind === 'reminder' ? { reminders: { increment: 1 } } : {}),
      },
    });
    const event = { type: LINK_EVENTS[prepared.kind], signerId, ip: null, userAgent: null };
    await appendSignatureEvent(tx, signer.envelopeId, at, event);
    await auditWork(tx, at, 'signature.email', signer, { kind: prepared.kind });
    return true;
  });
}

/** Código nuevo: su huella y su vencimiento quedan en la base; el código, solo en el correo. */
async function sendCode(deps: SignatureWorkDependencies, tenantId: string, signerId: string) {
  const issuedAt = deps.clock.now();
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const signer = await tx.sigSigner.findFirst({
      where: { id: signerId, status: 'pending', codeLocked: false, deletedAt: null },
    });
    const requestedAt = signer?.codeRequestedAt ?? null;
    if (signer === null || requestedAt === null) return null;
    if (signer.codeSentAt !== null && signer.codeSentAt >= requestedAt) return null;
    const envelope = await findEnvelope(tx, signer.envelopeId);
    if (envelope.status !== 'sent') return null;
    const code = newSignatureCode();
    await tx.sigSigner.update({
      where: { id: signer.id },
      data: {
        codeHash: codeHashOf(signer.id, code),
        codeExpiresAt: new Date(issuedAt.getTime() + SIGNATURE_RULES.codeMinutes * 60_000),
      },
    });
    await auditWork(tx, issuedAt, 'signature.code.issue', signer);
    return codeMail(envelope, signer, await companyIdentity(tx), code);
  });
  if (prepared === null) return false;
  await deps.mailer.send(prepared);
  await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const signer = await tx.sigSigner.findFirstOrThrow({ where: { id: signerId } });
    await tx.sigSigner.update({ where: { id: signerId }, data: { codeSentAt: issuedAt } });
    const event = { type: 'code_sent' as const, signerId, ip: null, userAgent: null };
    await appendSignatureEvent(tx, signer.envelopeId, deps.clock.now(), event);
    await auditWork(tx, deps.clock.now(), 'signature.code.email', signer);
  });
  return true;
}

/** Lo que necesita el documento firmado; null si el proceso ya no lo espera. */
async function prepareSeal(deps: SignatureWorkDependencies, tenantId: string, envelopeId: string) {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const envelope = await findEnvelope(tx, envelopeId);
    if (envelope.status !== 'completed' || envelope.sealStatus !== 'pending') return null;
    const original = await openAvailableFile(tx, deps.storage, envelope.documentFileId);
    if (original === null) return null;
    const evidence = await signatureEvidence(tx, envelope, deps.appUrl);
    return {
      envelope,
      original: await bufferOf(original.content),
      pages: await evidencePages(tx, evidence),
    };
  });
}

/** Guarda el certificado de evidencia; devuelve su archivo. */
async function storeCertificate(
  deps: SignatureWorkDependencies,
  envelope: EnvelopeWithSigners,
  certificate: Buffer,
): Promise<string | null> {
  let stored: string | null = null;
  const { tenantId } = envelope;
  await storeGeneratedPdf(
    deps,
    { tenantId, fileName: `${envelope.code}-certificado.pdf`, content: certificate },
    async (tx, fileId, at) => {
      await auditSignature(tx, systemActor(tenantId, at), 'signature.certificate.store', envelope, {
        evidence_file_id: fileId,
      });
      stored = fileId;
      return true;
    },
  );
  return stored;
}

/** El PDF aprobado, la página de firmas y el certificado, unidos en uno; el certificado, aparte. */
async function renderSealed(
  deps: SignatureWorkDependencies,
  prepared: {
    readonly original: Buffer;
    readonly pages: Awaited<ReturnType<typeof evidencePages>>;
  },
): Promise<{ readonly signed: Buffer; readonly certificate: Buffer }> {
  const signaturesPdf = await deps.convertHtml(prepared.pages.signatures);
  const certificate = await deps.convertHtml(prepared.pages.certificate);
  const signed = await deps.mergePdfs([prepared.original, signaturesPdf, certificate]);
  return { signed, certificate };
}

/**
 * El documento firmado: el PDF aprobado, la página final de firmas y el certificado de evidencia,
 * en un solo PDF con su huella; el certificado, también aparte. Desde ahí el contrato o el otrosí
 * rige y cada firmante recibe su copia.
 */
async function seal(deps: SignatureWorkDependencies, tenantId: string, envelopeId: string) {
  const prepared = await prepareSeal(deps, tenantId, envelopeId);
  if (prepared === null) return false;
  const { envelope } = prepared;
  const { signed, certificate } = await renderSealed(deps, prepared);
  const signedSha256 = sha256(signed);
  // El certificado queda guardado primero; el PDF firmado lo amarra todo en su transacción.
  const evidenceFileId = await storeCertificate(deps, envelope, certificate);
  return storeGeneratedPdf(
    deps,
    { tenantId, fileName: `${envelope.documentCode}-firmado.pdf`, content: signed },
    async (tx, fileId, at) => {
      if (evidenceFileId === null) return false;
      const { count } = await tx.sigEnvelope.updateMany({
        where: { id: envelope.id, status: 'completed', sealStatus: 'pending' },
        data: { sealStatus: 'ready', signedFileId: fileId, signedSha256, evidenceFileId },
      });
      if (count === 0) return false;
      await putDocumentInForce(tx, systemActor(tenantId, at), envelope, {
        signedFileId: fileId,
        signedSha256,
      });
      return true;
    },
  );
}

export async function tenantsBy(
  deps: SignatureWorkDependencies,
  work: 'work' | 'follow-up',
): Promise<string[]> {
  const rows = await deps.database.withoutTenant((tx) =>
    work === 'work'
      ? tx.$queryRaw<{ id: string }[]>`SELECT sig_tenants_with_work() AS id`
      : tx.$queryRaw<{ id: string }[]>`SELECT sig_tenants_with_follow_up() AS id`,
  );
  return rows.map((row) => row.id);
}

async function pendingWork(deps: SignatureWorkDependencies, tenantId: string) {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => ({
    mails: await tx.sigSigner.findMany({
      where: { mailPending: { not: null }, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
    codes: await tx.sigSigner.findMany({
      where: {
        codeRequestedAt: { not: null },
        status: 'pending',
        codeLocked: false,
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
    seals: await tx.sigEnvelope.findMany({
      where: { sealStatus: 'pending', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
  }));
}

/** Correos, códigos y documentos firmados pendientes de todas las empresas. */
export async function processSignatureWork(
  deps: SignatureWorkDependencies,
): Promise<SignatureWorkResult> {
  const totals = { emails: 0, codes: 0, sealed: 0 };
  for (const tenantId of await tenantsBy(deps, 'work')) {
    const pending = await pendingWork(deps, tenantId);
    for (const { id } of pending.codes) if (await sendCode(deps, tenantId, id)) totals.codes += 1;
    for (const { id } of pending.mails) {
      if (await sendLinkMail(deps, tenantId, id)) totals.emails += 1;
    }
    for (const { id } of pending.seals) if (await seal(deps, tenantId, id)) totals.sealed += 1;
  }
  return totals;
}
