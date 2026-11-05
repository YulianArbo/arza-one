import { ACCEPTANCE_TEXT, type SignatureMethod } from '@arza/contracts';

import type { SigSigner } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { ContractActor } from './contract-support.js';
import { notYourTurn, signatureStatusInvalid } from './signature-messages.js';
import { afterSignature, closeEnvelope } from './signature-progress.js';
import {
  appendSignatureEvent,
  eventFrom,
  recordSignatureChange,
  type EnvelopeWithSigners,
} from './signature-records.js';

// La firma o el rechazo de una persona (numeral 19.2), por su enlace o, la empresa, desde su sesión.
// La firma guarda la fecha y hora del servidor, la IP, el navegador, el método y el texto exacto que
// aceptó, y queda en la cadena de eventos con la huella del documento.

/** Al firmante le toca y el proceso sigue abierto y en plazo. */
export function assertOnTurn(envelope: EnvelopeWithSigners, signer: SigSigner, at: Date): void {
  if (envelope.status !== 'sent') {
    throw signatureStatusInvalid('Este proceso de firma ya terminó o se cerró.');
  }
  if (envelope.expiresAt <= at) {
    throw signatureStatusInvalid('El plazo para firmar este documento ya venció.');
  }
  if (signer.status !== 'pending') {
    if (signer.status === 'waiting') throw notYourTurn();
    throw signatureStatusInvalid('Usted ya firmó o rechazó este documento.');
  }
}

/** La firma con su evidencia; el código y su confirmación ya no sirven. */
function signedData(actor: ContractActor, method: SignatureMethod) {
  return {
    status: 'signed',
    method,
    signedAt: actor.at,
    signIp: actor.meta?.ip ?? null,
    signUserAgent: actor.meta?.userAgent ?? null,
    acceptanceText: ACCEPTANCE_TEXT,
    codeHash: null,
    codeExpiresAt: null,
    ticketHash: null,
    ticketExpiresAt: null,
  } as const;
}

export async function recordSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  signer: SigSigner,
  method: SignatureMethod,
): Promise<void> {
  assertOnTurn(envelope, signer, actor.at);
  const { count } = await tx.sigSigner.updateMany({
    where: { id: signer.id, status: 'pending' },
    data: signedData(actor, method),
  });
  if (count === 0) throw signatureStatusInvalid('Usted ya firmó o rechazó este documento.');
  await appendSignatureEvent(
    tx,
    envelope.id,
    actor.at,
    eventFrom(actor, 'signed', signer.id, {
      method,
      document_sha256: envelope.documentSha256,
      acceptance: ACCEPTANCE_TEXT,
    }),
  );
  await recordSignatureChange(tx, actor, {
    action: 'signature.sign',
    event: 'signature.signer.signed',
    envelope,
    changes: { signer_id: signer.id, sign_order: signer.signOrder, method },
  });
  await afterSignature(tx, actor, envelope.id);
}

export async function recordRejection(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  signer: SigSigner,
  reason: string,
): Promise<void> {
  assertOnTurn(envelope, signer, actor.at);
  const { count } = await tx.sigSigner.updateMany({
    where: { id: signer.id, status: 'pending' },
    data: {
      status: 'rejected',
      rejectedAt: actor.at,
      rejectReason: reason,
      ticketHash: null,
      ticketExpiresAt: null,
    },
  });
  if (count === 0) throw signatureStatusInvalid('Usted ya firmó o rechazó este documento.');
  await appendSignatureEvent(
    tx,
    envelope.id,
    actor.at,
    eventFrom(actor, 'rejected', signer.id, { reason }),
  );
  await closeEnvelope(tx, actor, envelope, {
    status: 'rejected',
    reason: `${signer.name} rechazó el documento: ${reason}`,
  });
}
