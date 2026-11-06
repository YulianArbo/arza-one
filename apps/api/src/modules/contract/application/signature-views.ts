import {
  signatureEventTypeSchema,
  signatureMethodSchema,
  signatureSourceSchema,
  signerKindSchema,
  type Envelope,
} from '@arza/contracts';

import type { SigEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { chainIntact } from '../domain/signature-chain.js';
import { envelopeStatusOf, signerStatusOf, type EnvelopeWithSigners } from './signature-records.js';

// El proceso de firma como lo ve el equipo en la ficha del contrato (B25): sus firmantes, su
// cadena de eventos y si la cadena sigue intacta. La IP y el navegador de cada evento son evidencia:
// solo los ve quien tiene el permiso de ver las evidencias.

const detailsValue = (value: unknown): string | number | boolean | null =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null;

function linksOf(events: readonly SigEvent[]) {
  return events.map((event) => ({
    envelopeId: event.envelopeId,
    signerId: event.signerId,
    sequence: event.sequence,
    type: event.type,
    ip: event.ip,
    userAgent: event.userAgent,
    occurredAt: event.occurredAt,
    details: Object.fromEntries(
      Object.entries((event.details ?? {}) as Record<string, unknown>).map(([key, value]) => [
        key,
        detailsValue(value),
      ]),
    ),
    prevHash: event.prevHash,
    hash: event.hash,
  }));
}

export async function envelopeEvents(
  tx: TenantTransaction,
  envelopeId: string,
): Promise<SigEvent[]> {
  return tx.sigEvent.findMany({ where: { envelopeId }, orderBy: { sequence: 'asc' } });
}

/** La cadena del proceso, desde la huella del documento, está completa y sin cambios. */
function envelopeChainIntact(
  envelope: Pick<EnvelopeWithSigners, 'documentSha256' | 'lastEventHash' | 'eventCount'>,
  events: readonly SigEvent[],
): boolean {
  const last = events.at(-1);
  return (
    events.length === envelope.eventCount &&
    (last?.hash ?? envelope.documentSha256) === envelope.lastEventHash &&
    chainIntact(envelope.documentSha256, linksOf(events))
  );
}

interface Viewer {
  readonly userId: string;
  readonly seesEvidence: boolean;
}

function signerView(signer: EnvelopeWithSigners['signers'][number], viewer: Viewer) {
  return {
    id: signer.id,
    kind: signerKindSchema.parse(signer.kind),
    sign_order: signer.signOrder,
    name: signer.name,
    email: signer.email,
    id_number: signer.idNumber,
    role: signer.role,
    status: signerStatusOf(signer),
    method: signer.method === null ? null : signatureMethodSchema.parse(signer.method),
    opened_at: signer.openedAt?.toISOString() ?? null,
    signed_at: signer.signedAt?.toISOString() ?? null,
    rejected_at: signer.rejectedAt?.toISOString() ?? null,
    reject_reason: signer.rejectReason,
    reminders: signer.reminders,
    code_locked: signer.codeLocked,
    is_me: signer.kind === 'company' && signer.userId === viewer.userId,
  };
}

function eventView(event: SigEvent, names: ReadonlyMap<string, string>, viewer: Viewer) {
  return {
    id: event.id,
    type: signatureEventTypeSchema.parse(event.type),
    signer_name: event.signerId === null ? null : (names.get(event.signerId) ?? null),
    occurred_at: event.occurredAt.toISOString(),
    ip: viewer.seesEvidence ? event.ip : null,
    user_agent: viewer.seesEvidence ? event.userAgent : null,
    hash: event.hash,
  };
}

export function envelopeView(
  envelope: EnvelopeWithSigners,
  events: readonly SigEvent[],
  viewer: Viewer,
): Envelope {
  const names = new Map(envelope.signers.map((signer) => [signer.id, signer.name]));
  return {
    id: envelope.id,
    code: envelope.code,
    source: signatureSourceSchema.parse(envelope.source),
    document: {
      id: envelope.amendmentId ?? envelope.contractId ?? envelope.sourceId ?? envelope.id,
      code: envelope.documentCode,
      title: envelope.documentTitle,
      sha256: envelope.documentSha256,
    },
    status: envelopeStatusOf(envelope),
    message: envelope.message,
    expires_at: envelope.expiresAt.toISOString(),
    sent_at: envelope.sentAt?.toISOString() ?? null,
    completed_at: envelope.completedAt?.toISOString() ?? null,
    closed_reason: envelope.closedReason,
    signed:
      envelope.verificationCode === null
        ? null
        : {
            status: envelope.sealStatus === 'ready' ? 'ready' : 'pending',
            sha256: envelope.signedSha256,
            verification_code: envelope.verificationCode,
          },
    signers: envelope.signers.map((signer) => signerView(signer, viewer)),
    events: events.map((event) => eventView(event, names, viewer)),
    chain_intact: envelopeChainIntact(envelope, events),
    created_at: envelope.createdAt.toISOString(),
    version: envelope.version,
  };
}
