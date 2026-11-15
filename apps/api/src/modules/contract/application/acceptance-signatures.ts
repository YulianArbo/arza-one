import type { EnvelopeStatus } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessCode } from '../../core/index.js';
import { contractParty } from '../../party/index.js';
import { endOfBogotaDay } from '../domain/signature-rules.js';
import type { ContractActor } from './contract-support.js';
import { signersInvalid } from './signature-messages.js';
import { afterSignature } from './signature-progress.js';
import {
  ENVELOPES,
  ENVELOPE_SEQUENCE,
  appendSignatureEvent,
  envelopeStatusOf,
  eventFrom,
  recordSignatureChange,
} from './signature-records.js';
import { ACCEPTANCE_SOURCE } from './signature-sources.js';

// La firma del acta de entrega de un proyecto (B27, ficha 17.8 y numeral 19.1, nivel 2): Proyectos
// entrega el PDF del acta FT-TEC-001 y la persona del cliente que la recibe; aquí se arma el proceso
// de firma, con un solo firmante (decisión 1 del B27), y sale enseguida a su correo con su enlace.
// Proyectos sigue el resultado con signatureOutcome: no hay llamadas de vuelta entre los módulos.

/** Quien puede firmar un acta por el cliente: sus firmantes autorizados en Terceros. */
export interface AcceptanceSigner {
  readonly id: string;
  readonly name: string;
  /** Tiene correo y documento: puede recibir el enlace y firmar. */
  readonly ready: boolean;
}

export async function acceptanceSigners(
  tx: TenantTransaction,
  partyId: string,
): Promise<AcceptanceSigner[]> {
  const party = await contractParty(tx, partyId);
  if (party === null) return [];
  return party.signers.map((signer) => ({
    id: signer.personId,
    name: signer.name,
    ready: signer.email !== null && signer.document !== null,
  }));
}

/** Lo que Proyectos entrega para firmar el acta. */
export interface AcceptanceSignatureRequest {
  /** El acta en Proyectos: el proceso la guarda por identificador. */
  readonly acceptanceId: string;
  readonly partyId: string;
  readonly signerId: string;
  readonly fileId: string;
  readonly sha256: string;
  /** Código del registro FT-TEC-001 y título que ve quien firma. */
  readonly code: string;
  readonly title: string;
  /** Último día para firmar, AAAA-MM-DD. */
  readonly expiresOn: string;
  readonly message: string | null;
  /** Quien entregó: el proceso queda enviado a su nombre. */
  readonly sentBy: string;
}

async function signerFor(tx: TenantTransaction, partyId: string, signerId: string) {
  const party = await contractParty(tx, partyId);
  const signer = party?.signers.find((candidate) => candidate.personId === signerId);
  if (party === null || signer === undefined) {
    throw signersInvalid('Solo reciben el acta los firmantes autorizados del cliente en Terceros.');
  }
  if (signer.email === null || signer.document === null) {
    throw signersInvalid(
      `Registre en Terceros el correo y el documento de ${signer.name} antes de enviarle el acta.`,
    );
  }
  const ownBehalf = party.signers.length === 1 && signer.personId === party.id;
  return {
    name: signer.name,
    email: signer.email,
    document: signer.document,
    role: ownBehalf ? 'En nombre propio' : `Por ${party.name}`,
  };
}

/** Arma y envía el proceso de firma del acta; devuelve su identificador y su código. */
export async function sendAcceptanceSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  input: AcceptanceSignatureRequest,
): Promise<{ readonly id: string; readonly code: string }> {
  const signer = await signerFor(tx, input.partyId, input.signerId);
  const envelope = await createAcceptanceEnvelope(tx, actor, input);
  await tx.sigSigner.create({
    data: {
      tenantId: actor.tenantId,
      envelopeId: envelope.id,
      kind: 'client',
      partyId: input.signerId,
      name: signer.name,
      email: signer.email,
      idNumber: signer.document,
      role: signer.role,
      signOrder: 1,
    },
  });
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'created', null));
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'sent', null));
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.send',
    event: 'signature.envelope.sent',
    envelope,
    changes: { status: [null, 'sent'], signers: 1, expires_on: input.expiresOn },
    payload: { source_id: input.acceptanceId, party_id: input.partyId },
  });
  await afterSignature(tx, actor, envelope.id);
  return { id: envelope.id, code: envelope.code };
}

/** El proceso ya enviado, a nombre de quien entregó; la cadena parte de la huella del acta. */
async function createAcceptanceEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  input: AcceptanceSignatureRequest,
) {
  return tx.sigEnvelope.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, ENVELOPE_SEQUENCE, actor.at, ENVELOPES),
      source: ACCEPTANCE_SOURCE,
      sourceId: input.acceptanceId,
      partyId: input.partyId,
      documentFileId: input.fileId,
      documentSha256: input.sha256,
      documentCode: input.code,
      documentTitle: input.title,
      message: input.message,
      expiresAt: endOfBogotaDay(input.expiresOn),
      lastEventHash: input.sha256,
      status: 'sent',
      sentAt: actor.at,
      sentBy: input.sentBy,
      sendKey: `acceptance:${input.acceptanceId}`,
    },
  });
}

/** Cómo va el proceso: lo que Proyectos necesita para dejar aceptado o devuelto el entregable. */
export interface SignatureOutcome {
  readonly status: EnvelopeStatus;
  /** Firmado por todos y con su PDF firmado listo. */
  readonly signedFileId: string | null;
  readonly closedReason: string | null;
  readonly closedAt: Date | null;
  readonly completedAt: Date | null;
}

export async function signatureOutcome(
  tx: TenantTransaction,
  envelopeId: string,
): Promise<SignatureOutcome | null> {
  const envelope = await tx.sigEnvelope.findFirst({
    where: { id: envelopeId, source: ACCEPTANCE_SOURCE, deletedAt: null },
  });
  if (envelope === null) return null;
  return {
    status: envelopeStatusOf(envelope),
    signedFileId: envelope.sealStatus === 'ready' ? envelope.signedFileId : null,
    closedReason: envelope.closedReason,
    closedAt: envelope.closedAt,
    completedAt: envelope.completedAt,
  };
}
