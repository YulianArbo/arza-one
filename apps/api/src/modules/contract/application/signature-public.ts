import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  ACCEPTANCE_TEXT,
  SIGNATURE_RULES,
  type PublicRejectRequest,
  type PublicSignRequest,
  type PublicSignature,
  type PublicSignatureDocumentRequest,
  type VerifySignatureCodeRequest,
  type VerifySignatureCodeResponse,
} from '@arza/contracts';

import type { SigSigner } from '../../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { companyIdentity } from '../../core/index.js';
import { FileStorage, openAvailableFile, type OpenedFile } from '../../doc/index.js';
import { maskEmail, publicStateOf } from '../domain/signature-rules.js';
import type { ContractActor } from './contract-support.js';
import {
  codeExpired,
  codeInvalid,
  codeLocked,
  codeTooSoon,
  signatureLinkInvalid,
  signedCopyNotReady,
  ticketInvalid,
} from './signature-messages.js';
import {
  appendSignatureEvent,
  auditSignature,
  eventFrom,
  findEnvelope,
  signerStatusOf,
  type EnvelopeWithSigners,
} from './signature-records.js';
import { assertOnTurn, recordRejection, recordSignature } from './signature-signing.js';
import { envelopeDocument, isAcceptance } from './signature-sources.js';

/** Lo que ve quien firma un acta de entrega de un proyecto (B27). */
const ACCEPTANCE_KIND = 'Acta de entrega técnica';

// La página de firma (B25, numeral 19.2): quien firma por el cliente abre el enlace de su correo, sin
// sesión. La API solo conoce la huella de la llave: con ella encuentra la empresa y el firmante, y lo
// demás se lee dentro de esa empresa, con su seguridad por fila. Para leer y firmar pide el código de
// seis números que llega al mismo correo; validarlo entrega una confirmación que dura 30 minutos.

interface LinkTarget {
  readonly tenantId: string;
  readonly envelopeId: string;
  readonly signerId: string;
}

interface Opened {
  readonly envelope: EnvelopeWithSigners;
  readonly signer: SigSigner;
  readonly actor: ContractActor;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Huella del código, atada al firmante: el mismo código de otro firmante no sirve. */
export function codeHashOf(signerId: string, code: string): string {
  return sha256(`${signerId}:${code}`);
}

function sameHash(stored: string | null, candidate: string): boolean {
  if (stored?.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(candidate));
}

/** Quien abre el enlace no tiene usuario: lo identifican su IP y su navegador. */
function linkActor(target: LinkTarget, meta: RequestMeta, at: Date): ContractActor {
  return { tenantId: target.tenantId, userId: null, meta, at };
}

@Injectable()
export class PublicSignaturesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  private async resolve(token: string): Promise<LinkTarget> {
    const rows = await this.database.withoutTenant(
      (tx) =>
        tx.$queryRaw<{ signer_id: string; envelope_id: string; tenant_id: string }[]>`
          SELECT signer_id, envelope_id, tenant_id FROM sig_find_signer_link(${sha256(token)})`,
    );
    const row = rows[0];
    if (row === undefined) throw signatureLinkInvalid();
    return { tenantId: row.tenant_id, envelopeId: row.envelope_id, signerId: row.signer_id };
  }

  /** Abre el enlace dentro de su empresa; un enlace vencido ya no sirve. */
  private async inLink<T>(
    token: string,
    meta: RequestMeta,
    work: (tx: TenantTransaction, opened: Opened) => Promise<T>,
  ): Promise<T> {
    const target = await this.resolve(token);
    const at = this.clock.now();
    return this.database.withTenant({ tenantId: target.tenantId, userId: null }, async (tx) => {
      const envelope = await findEnvelope(tx, target.envelopeId);
      const signer = envelope.signers.find((candidate) => candidate.id === target.signerId);
      const expiresAt = signer?.linkExpiresAt ?? null;
      if (signer === undefined || expiresAt === null || expiresAt <= at) {
        throw signatureLinkInvalid();
      }
      return work(tx, { envelope, signer, actor: linkActor(target, meta, at) });
    });
  }

  /** Lo que ve quien abre el enlace; queda en la cadena que lo abrió. */
  async open(token: string, meta: RequestMeta): Promise<PublicSignature> {
    return this.inLink(token, meta, async (tx, { envelope, signer, actor }) => {
      const view = await publicView(tx, envelope, signer);
      if (envelope.status === 'sent' || envelope.status === 'completed') {
        await appendSignatureEvent(
          tx,
          envelope.id,
          actor.at,
          eventFrom(actor, 'opened', signer.id),
        );
        if (signer.openedAt === null) {
          await tx.sigSigner.update({ where: { id: signer.id }, data: { openedAt: actor.at } });
        }
        await auditSignature(tx, actor, 'signature.link.open', envelope, { signer_id: signer.id });
      }
      return view;
    });
  }

  /** Pide el código: el worker lo genera y lo envía al correo en pocos segundos. */
  async requestCode(token: string, meta: RequestMeta): Promise<void> {
    await this.inLink(token, meta, async (tx, { envelope, signer, actor }) => {
      assertOnTurn(envelope, signer, actor.at);
      if (signer.codeLocked) throw codeLocked();
      const last = signer.codeRequestedAt?.getTime() ?? 0;
      const wait = Math.ceil(
        (last + SIGNATURE_RULES.codeIntervalSeconds * 1000 - actor.at.getTime()) / 1000,
      );
      if (wait > 0) throw codeTooSoon(wait);
      await tx.sigSigner.update({ where: { id: signer.id }, data: { codeRequestedAt: actor.at } });
      await auditSignature(tx, actor, 'signature.code.request', envelope, { signer_id: signer.id });
    });
  }

  /** Valida el código; al quinto equivocado, el enlace se bloquea (numeral 19.2). */
  async verifyCode(
    input: VerifySignatureCodeRequest,
    meta: RequestMeta,
  ): Promise<VerifySignatureCodeResponse> {
    const outcome = await this.inLink(input.token, meta, async (tx, opened) =>
      checkCode(tx, opened, input.code),
    );
    if (outcome.kind === 'failed') throw outcome.error;
    return outcome.response;
  }

  /** El PDF por firmar (con el código validado) o el firmado (cuando firmaron todos). */
  async document(input: PublicSignatureDocumentRequest, meta: RequestMeta): Promise<OpenedFile> {
    return this.inLink(input.token, meta, async (tx, { envelope, signer, actor }) => {
      let fileId: string | null;
      if (input.document === 'signed') {
        if (envelope.status !== 'completed' || envelope.signedFileId === null) {
          throw signedCopyNotReady();
        }
        fileId = envelope.signedFileId;
      } else {
        assertTicket(signer, input.ticket, actor.at);
        fileId = envelope.documentFileId;
      }
      const file = await openAvailableFile(tx, this.storage, fileId);
      if (file === null) throw signedCopyNotReady();
      const type = input.disposition === 'inline' ? 'viewed' : 'downloaded';
      await appendSignatureEvent(
        tx,
        envelope.id,
        actor.at,
        eventFrom(actor, type, signer.id, { document: input.document }),
      );
      await auditSignature(
        tx,
        actor,
        `signature.document.${type === 'viewed' ? 'view' : 'download'}`,
        envelope,
        {
          signer_id: signer.id,
          document: input.document,
        },
      );
      return file;
    });
  }

  async sign(input: PublicSignRequest, meta: RequestMeta): Promise<void> {
    await this.inLink(input.token, meta, async (tx, { envelope, signer, actor }) => {
      assertTicket(signer, input.ticket, actor.at);
      await recordSignature(tx, actor, envelope, signer, 'email_code');
    });
  }

  async reject(input: PublicRejectRequest, meta: RequestMeta): Promise<void> {
    await this.inLink(input.token, meta, async (tx, { envelope, signer, actor }) => {
      assertTicket(signer, input.ticket, actor.at);
      await recordRejection(tx, actor, envelope, signer, input.reason);
    });
  }
}

type CodeOutcome =
  | { readonly kind: 'verified'; readonly response: VerifySignatureCodeResponse }
  | { readonly kind: 'failed'; readonly error: Error };

/**
 * Revisa el código. Un intento fallido se guarda aunque la respuesta sea un error: por eso no se
 * lanza dentro de la transacción, que lo desharía.
 */
async function checkCode(
  tx: TenantTransaction,
  { envelope, signer, actor }: Opened,
  code: string,
): Promise<CodeOutcome> {
  assertOnTurn(envelope, signer, actor.at);
  if (signer.codeLocked) return { kind: 'failed', error: codeLocked() };
  if (
    signer.codeHash === null ||
    signer.codeExpiresAt === null ||
    signer.codeExpiresAt <= actor.at
  ) {
    return { kind: 'failed', error: codeExpired() };
  }
  if (!sameHash(signer.codeHash, codeHashOf(signer.id, code))) {
    return { kind: 'failed', error: await failAttempt(tx, envelope, signer, actor) };
  }
  const ticket = randomBytes(32).toString('base64url');
  const expiresAt = new Date(actor.at.getTime() + SIGNATURE_RULES.ticketMinutes * 60_000);
  await tx.sigSigner.update({
    where: { id: signer.id },
    data: {
      codeHash: null,
      codeExpiresAt: null,
      codeAttempts: 0,
      ticketHash: sha256(ticket),
      ticketExpiresAt: expiresAt,
    },
  });
  await appendSignatureEvent(
    tx,
    envelope.id,
    actor.at,
    eventFrom(actor, 'code_verified', signer.id),
  );
  await auditSignature(tx, actor, 'signature.code.verify', envelope, { signer_id: signer.id });
  return { kind: 'verified', response: { ticket, expires_at: expiresAt.toISOString() } };
}

async function failAttempt(
  tx: TenantTransaction,
  envelope: EnvelopeWithSigners,
  signer: SigSigner,
  actor: ContractActor,
): Promise<Error> {
  const attempts = signer.codeAttempts + 1;
  const locked = attempts >= SIGNATURE_RULES.codeAttempts;
  await tx.sigSigner.update({
    where: { id: signer.id },
    data: locked
      ? { codeAttempts: attempts, codeLocked: true, codeHash: null, codeExpiresAt: null }
      : { codeAttempts: attempts },
  });
  const type = locked ? 'code_locked' : 'code_failed';
  await appendSignatureEvent(
    tx,
    envelope.id,
    actor.at,
    eventFrom(actor, type, signer.id, { attempts }),
  );
  await auditSignature(tx, actor, `signature.code.${locked ? 'lock' : 'fail'}`, envelope, {
    signer_id: signer.id,
    attempts,
  });
  return locked ? codeLocked() : codeInvalid(SIGNATURE_RULES.codeAttempts - attempts);
}

/** La confirmación del código sigue vigente para este firmante. */
function assertTicket(signer: SigSigner, ticket: string | undefined, at: Date): void {
  const valid =
    ticket !== undefined &&
    signer.ticketExpiresAt !== null &&
    signer.ticketExpiresAt > at &&
    sameHash(signer.ticketHash, sha256(ticket));
  if (!valid) throw ticketInvalid();
}

async function publicView(
  tx: TenantTransaction,
  envelope: EnvelopeWithSigners,
  signer: SigSigner,
): Promise<PublicSignature> {
  const [company, kind] = await Promise.all([
    companyIdentity(tx),
    isAcceptance(envelope)
      ? ACCEPTANCE_KIND
      : envelopeDocument(tx, envelope).then((document) => document.kind),
  ]);
  return {
    company: { name: company.legalName, tax_id: company.taxId },
    document: {
      code: envelope.documentCode,
      title: envelope.documentTitle,
      kind,
      sha256: envelope.documentSha256,
    },
    signer: {
      name: signer.name,
      id_number: signer.idNumber,
      role: signer.role,
      email_hint: maskEmail(signer.email),
    },
    state: publicStateOf(envelope.status, signerStatusOf(signer)),
    acceptance_text: ACCEPTANCE_TEXT,
    expires_at: envelope.expiresAt.toISOString(),
    signed_at: signer.signedAt?.toISOString() ?? null,
    code_locked: signer.codeLocked,
    signed_copy: envelope.status === 'completed' && envelope.sealStatus === 'ready',
  };
}
