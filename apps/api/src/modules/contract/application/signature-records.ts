import {
  envelopeStatusSchema,
  signerStatusSchema,
  type EnvelopeStatus,
  type SignatureEventType,
  type SignerStatus,
} from '@arza/contracts';

import type { Prisma, SigEnvelope, SigSigner } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { linkHash, type ChainLink } from '../domain/signature-chain.js';
import { envelopeNotFound, signatureStatusInvalid } from './signature-messages.js';
import { recordContractChange, type ContractActor } from './contract-support.js';

// Lectura y escritura comunes de los procesos de firma (B25). Todo lo que pasa en un proceso queda
// en dos lugares: la auditoría de la plataforma, como cualquier escritura, y la cadena de eventos
// del propio proceso (sig_events), que forma parte del paquete de evidencia (numeral 19.3).

export const ENVELOPE_SEQUENCE = 'sig.envelope';
export const ENVELOPES = {
  name: 'Procesos de firma electrónica',
  prefix: 'FE',
  padding: 4,
} as const;

export type EnvelopeWithSigners = SigEnvelope & { readonly signers: SigSigner[] };

export async function findEnvelope(
  tx: TenantTransaction,
  id: string,
): Promise<EnvelopeWithSigners> {
  const envelope = await tx.sigEnvelope.findFirst({
    where: { id, deletedAt: null },
    include: { signers: { where: { deletedAt: null }, orderBy: { signOrder: 'asc' } } },
  });
  if (envelope === null) throw envelopeNotFound();
  return envelope;
}

export function envelopeStatusOf(envelope: Pick<SigEnvelope, 'status'>): EnvelopeStatus {
  return envelopeStatusSchema.parse(envelope.status);
}

export function signerStatusOf(signer: Pick<SigSigner, 'status'>): SignerStatus {
  return signerStatusSchema.parse(signer.status);
}

export function assertEnvelopeStatus(
  envelope: Pick<SigEnvelope, 'status'>,
  allowed: readonly EnvelopeStatus[],
  detail: string,
): void {
  if (!allowed.includes(envelopeStatusOf(envelope))) throw signatureStatusInvalid(detail);
}

/** Un evento de la cadena: quién (si es un firmante), desde dónde y con qué datos mínimos. */
export interface SignatureEventInput {
  readonly type: SignatureEventType;
  readonly signerId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly details?: ChainLink['details'];
}

/**
 * Agrega un eslabón a la cadena del proceso. Bloquea la fila del proceso para que dos eventos al
 * mismo tiempo no tomen la misma huella anterior.
 */
export async function appendSignatureEvent(
  tx: TenantTransaction,
  envelopeId: string,
  at: Date,
  event: SignatureEventInput,
): Promise<void> {
  const rows = await tx.$queryRaw<
    { tenant_id: string; last_event_hash: string; event_count: number }[]
  >`SELECT tenant_id, last_event_hash, event_count FROM sig_envelopes
    WHERE id = ${envelopeId}::uuid FOR UPDATE`;
  const head = rows[0];
  if (head === undefined) throw envelopeNotFound();
  const link: ChainLink = {
    envelopeId,
    signerId: event.signerId,
    sequence: head.event_count + 1,
    type: event.type,
    ip: event.ip,
    userAgent: event.userAgent,
    occurredAt: at,
    details: event.details ?? {},
  };
  const hash = linkHash(head.last_event_hash, link);
  await tx.sigEvent.create({
    data: { ...link, tenantId: head.tenant_id, prevHash: head.last_event_hash, hash },
  });
  await tx.sigEnvelope.update({
    where: { id: envelopeId },
    data: { lastEventHash: hash, eventCount: link.sequence },
  });
}

/** El evento de la cadena con la IP y el navegador de quien actúa. */
export function eventFrom(
  actor: ContractActor,
  type: SignatureEventType,
  signerId: string | null,
  details?: ChainLink['details'],
): SignatureEventInput {
  return {
    type,
    signerId,
    ip: actor.meta?.ip ?? null,
    userAgent: actor.meta?.userAgent ?? null,
    ...(details === undefined ? {} : { details }),
  };
}

/** Lo que guarda la auditoría del proceso: códigos y estados, nunca correos ni documentos. */
export function envelopeAudit(envelope: SigEnvelope): Record<string, string | null> {
  return {
    code: envelope.code,
    status: envelope.status,
    document_code: envelope.documentCode,
    document_sha256: envelope.documentSha256,
  };
}

/** Datos del evento de la bandeja de salida: identificadores y códigos, sin datos personales. */
export function envelopePayload(envelope: SigEnvelope): Prisma.InputJsonObject {
  return {
    code: envelope.code,
    source: envelope.source,
    contract_id: envelope.contractId,
    amendment_id: envelope.amendmentId,
    document_code: envelope.documentCode,
  };
}

/** Solo la auditoría: pasos menores del enlace que no avisan a nadie, como pedir un código. */
export async function auditSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  action: string,
  envelope: SigEnvelope,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action,
    entityType: 'sig_envelope',
    entityId: envelope.id,
    result: 'success',
    changes: { ...envelopeAudit(envelope), ...changes },
    meta: actor.meta,
  });
}

export interface SignatureChange {
  readonly action: string;
  readonly event: string;
  readonly envelope: SigEnvelope;
  readonly changes?: Prisma.InputJsonObject;
  readonly payload?: Prisma.InputJsonObject;
}

/** Auditoría y bandeja de salida de un paso del proceso, en la misma transacción. */
export async function recordSignatureChange(
  tx: TenantTransaction,
  actor: ContractActor,
  change: SignatureChange,
): Promise<void> {
  await recordContractChange(tx, actor, {
    action: change.action,
    event: change.event,
    entityType: 'sig_envelope',
    entityId: change.envelope.id,
    changes: { ...envelopeAudit(change.envelope), ...change.changes },
    payload: { ...envelopePayload(change.envelope), ...change.payload },
  });
}
