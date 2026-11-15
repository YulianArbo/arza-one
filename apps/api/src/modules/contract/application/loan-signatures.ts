import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessCode } from '../../core/index.js';
import { signingPerson } from '../../party/index.js';
import { endOfBogotaDay } from '../domain/signature-rules.js';
import type { SignatureOutcome } from './acceptance-signatures.js';
import type { ContractActor } from './contract-support.js';
import { signersInvalid } from './signature-messages.js';
import { afterSignature, closeEnvelope } from './signature-progress.js';
import {
  ENVELOPES,
  ENVELOPE_SEQUENCE,
  appendSignatureEvent,
  envelopeStatusOf,
  eventFrom,
  recordSignatureChange,
} from './signature-records.js';
import { LOAN_SOURCE } from './signature-sources.js';

// La firma del contrato de comodato de un activo (B34, ficha 17.12 y numeral 19.1, nivel 2):
// Activos entrega el PDF del CT-ADM-001 y la persona de Terceros del colaborador que recibe; aquí
// se arma el proceso con ese único firmante y sale enseguida a su correo de trabajo con su enlace.
// Activos sigue el resultado con loanSignatureOutcome: no hay llamadas de vuelta entre módulos.

/** Lo que Activos entrega para firmar el comodato. */
export interface LoanSignatureRequest {
  /** La asignación en Activos: el proceso la guarda por identificador. */
  readonly assignmentId: string;
  /** La persona de Terceros del colaborador y el correo de su cuenta. */
  readonly personId: string;
  readonly email: string;
  readonly fileId: string;
  readonly sha256: string;
  /** Código del registro CT-ADM-001 y título que ve quien firma. */
  readonly code: string;
  readonly title: string;
  /** Último día para firmar, AAAA-MM-DD. */
  readonly expiresOn: string;
  readonly message: string | null;
  /** Quien asignó: el proceso queda enviado a su nombre. */
  readonly sentBy: string;
}

async function borrowerOf(tx: TenantTransaction, personId: string) {
  const person = await signingPerson(tx, personId);
  const document = person?.document ?? null;
  if (person === null || document === null) {
    throw signersInvalid(
      'Registre en Terceros el documento de quien recibe el activo antes de enviarle el comodato.',
    );
  }
  return { name: person.name, document };
}

/** Arma y envía el proceso de firma del comodato; devuelve su identificador y su código. */
export async function sendLoanSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  input: LoanSignatureRequest,
): Promise<{ readonly id: string; readonly code: string }> {
  const borrower = await borrowerOf(tx, input.personId);
  const envelope = await createLoanEnvelope(tx, actor, input);
  await tx.sigSigner.create({
    data: {
      tenantId: actor.tenantId,
      envelopeId: envelope.id,
      kind: 'client',
      partyId: input.personId,
      name: borrower.name,
      email: input.email,
      idNumber: borrower.document,
      role: 'Comodatario',
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
    payload: { source_id: input.assignmentId, party_id: input.personId },
  });
  await afterSignature(tx, actor, envelope.id);
  return { id: envelope.id, code: envelope.code };
}

/** El proceso ya enviado, a nombre de quien asignó; la cadena parte de la huella del comodato. */
async function createLoanEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  input: LoanSignatureRequest,
) {
  return tx.sigEnvelope.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, ENVELOPE_SEQUENCE, actor.at, ENVELOPES),
      source: LOAN_SOURCE,
      sourceId: input.assignmentId,
      partyId: input.personId,
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
      sendKey: `asset_loan:${input.assignmentId}`,
    },
  });
}

function loanEnvelope(tx: TenantTransaction, envelopeId: string) {
  return tx.sigEnvelope.findFirst({
    where: { id: envelopeId, source: LOAN_SOURCE, deletedAt: null },
    include: { signers: { where: { deletedAt: null }, orderBy: { signOrder: 'asc' } } },
  });
}

/** Cómo va el proceso: lo que Activos necesita para dejar vigente o anulada la asignación. */
export async function loanSignatureOutcome(
  tx: TenantTransaction,
  envelopeId: string,
): Promise<SignatureOutcome | null> {
  const envelope = await loanEnvelope(tx, envelopeId);
  if (envelope === null) return null;
  return {
    status: envelopeStatusOf(envelope),
    signedFileId: envelope.sealStatus === 'ready' ? envelope.signedFileId : null,
    closedReason: envelope.closedReason,
    closedAt: envelope.closedAt,
    completedAt: envelope.completedAt,
  };
}

/** Activos anuló la asignación antes de la firma: el proceso se cierra. True si aún seguía abierto. */
export async function cancelLoanSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  envelopeId: string,
  reason: string,
): Promise<boolean> {
  const envelope = await loanEnvelope(tx, envelopeId);
  if (envelope === null || envelopeStatusOf(envelope) !== 'sent') return false;
  await closeEnvelope(tx, actor, envelope, { status: 'cancelled', reason });
  return true;
}
