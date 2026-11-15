import type { SignatureEventType } from '@arza/contracts';

import type { Prisma, SigEnvelope } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { closeWorkflowAsOwner, startWorkflow } from '../../wf/index.js';
import { SIGNATURE_ACTIONS, SIGNATURE_FLOW } from '../domain/contract-flows.js';
import { newVerificationCode, signerOnTurn } from '../domain/signature-rules.js';
import { contractEventPayload } from './contract-records.js';
import type { ContractActor } from './contract-support.js';
import { signatureStatusInvalid } from './signature-messages.js';
import {
  appendSignatureEvent,
  assertEnvelopeStatus,
  envelopeStatusOf,
  eventFrom,
  findEnvelope,
  recordSignatureChange,
  signerStatusOf,
  type EnvelopeWithSigners,
} from './signature-records.js';
import {
  assertSignable,
  envelopeDocument,
  isStandalone,
  moveDocument,
} from './signature-sources.js';

// El avance de un proceso de firma (B25, numeral 19.2): se envía, firma cada uno en su turno, y al
// final firma la empresa. Termina firmado por todos, o cerrado sin firmar (rechazado, vencido o
// anulado), y entonces el contrato o el otrosí vuelve a «aprobado» para enviarlo de nuevo. El acta
// de entrega de un proyecto (B27) sigue el mismo camino; Proyectos lee cómo terminó.

/** Datos del evento para avisar al autor y al responsable del contrato. */
export async function noticePayload(
  tx: TenantTransaction,
  envelope: SigEnvelope,
): Promise<Prisma.InputJsonObject> {
  if (isStandalone(envelope)) return { source_id: envelope.sourceId, party_id: envelope.partyId };
  const document = await envelopeDocument(tx, envelope);
  return { ...contractEventPayload(document.contract), contract_code: document.contract.code };
}

/**
 * Envía el proceso: el contrato o el otrosí queda «en firma» y el primer firmante recibe su enlace.
 * Repetirlo con la misma llave no hace nada; con otra llave, el proceso ya no está por enviar.
 */
export async function sendEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  target: { readonly id: string; readonly version: number; readonly key: string },
): Promise<void> {
  const envelope = await findEnvelope(tx, target.id);
  if (envelope.sendKey !== null) {
    if (envelope.sendKey === target.key) return;
    throw idempotencyKeyReused();
  }
  assertEnvelopeStatus(envelope, ['draft'], 'Este proceso de firma ya se envió o se cerró.');
  if (envelope.expiresAt <= actor.at) {
    throw signatureStatusInvalid(
      'El plazo para firmar ya pasó. Anule este proceso y prepare otro.',
    );
  }
  const document = await envelopeDocument(tx, envelope);
  assertSignable(document);
  const { count } = await tx.sigEnvelope.updateMany({
    where: { id: envelope.id, version: target.version, status: 'draft' },
    data: { status: 'sent', sentAt: actor.at, sentBy: actor.userId, sendKey: target.key },
  });
  if (count === 0) throw versionConflict();
  await moveDocument(tx, document, 'in_signature');
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'sent', null));
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.send',
    event: 'signature.envelope.sent',
    envelope,
    changes: { status: ['draft', 'sent'] },
  });
  await giveTurn(tx, actor, await findEnvelope(tx, envelope.id));
}

/** Le toca al siguiente: el cliente recibe su enlace; la empresa, la tarea en Mis tareas. */
async function giveTurn(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
): Promise<void> {
  const next = signerOnTurn(
    envelope.signers.map((signer) => ({ ...signer, status: signerStatusOf(signer) })),
  );
  if (next === null) {
    await completeEnvelope(tx, actor, envelope);
    return;
  }
  if (next.kind === 'client') {
    await tx.sigSigner.update({
      where: { id: next.id },
      data: { status: 'pending', mailPending: 'invitation' },
    });
    return;
  }
  await tx.sigSigner.update({ where: { id: next.id }, data: { status: 'pending' } });
  const instance = await startWorkflow(tx, actor, {
    key: SIGNATURE_FLOW,
    entityType: SIGNATURE_FLOW,
    entityId: envelope.id,
    title: `Firmar ${envelope.documentCode} por la empresa: ${envelope.documentTitle}`,
    facts: {},
    ...(next.userId === null ? {} : { initiator: next.userId }),
  });
  await tx.sigEnvelope.update({
    where: { id: envelope.id },
    data: { workflowInstanceId: instance.id },
  });
}

/** Después de una firma: el turno pasa al siguiente o, si era el último, el proceso termina. */
export async function afterSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  envelopeId: string,
): Promise<void> {
  await giveTurn(tx, actor, await findEnvelope(tx, envelopeId));
}

/** Firmaron todos: queda el código de verificación y el worker arma el documento firmado. */
async function completeEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: SigEnvelope,
): Promise<void> {
  const { count } = await tx.sigEnvelope.updateMany({
    where: { id: envelope.id, status: 'sent' },
    data: {
      status: 'completed',
      completedAt: actor.at,
      closedAt: actor.at,
      sealStatus: 'pending',
      verificationCode: newVerificationCode(),
    },
  });
  if (count === 0) throw signatureStatusInvalid('El proceso cambió mientras tanto. Recargue.');
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'completed', null));
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.complete',
    event: 'signature.envelope.signed',
    envelope,
    changes: { status: ['sent', 'completed'] },
  });
}

export interface EnvelopeClosing {
  readonly status: 'rejected' | 'expired' | 'cancelled';
  readonly reason: string;
}

const CLOSING_EVENTS: Readonly<Record<EnvelopeClosing['status'], SignatureEventType>> = {
  rejected: 'rejected',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** Cierra el proceso sin firmar; el contrato o el otrosí vuelve a «aprobado». */
export async function closeEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  closing: EnvelopeClosing,
): Promise<void> {
  const from = envelopeStatusOf(envelope);
  const { count } = await tx.sigEnvelope.updateMany({
    where: { id: envelope.id, status: { in: ['draft', 'sent'] } },
    data: { status: closing.status, closedAt: actor.at, closedReason: closing.reason },
  });
  if (count === 0) throw signatureStatusInvalid('Este proceso de firma ya terminó o se cerró.');
  await tx.sigSigner.updateMany({
    where: { envelopeId: envelope.id, mailPending: { not: null } },
    data: { mailPending: null },
  });
  const type = CLOSING_EVENTS[closing.status];
  // El rechazo ya quedó en la cadena, con los datos de quien rechazó.
  if (closing.status !== 'rejected') {
    await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, type, null));
  }
  if (from === 'sent' && !isStandalone(envelope)) {
    await moveDocument(tx, await envelopeDocument(tx, envelope), 'approved');
  }
  if (envelope.workflowInstanceId !== null) {
    await closeWorkflowAsOwner(tx, actor, {
      instanceId: envelope.workflowInstanceId,
      action: SIGNATURE_ACTIONS.close,
      comment: closing.reason,
    });
  }
  await recordSignatureChange(tx, actor, {
    action: `signature.envelope.${closing.status === 'cancelled' ? 'cancel' : closing.status === 'rejected' ? 'reject' : 'expire'}`,
    event: `signature.envelope.${closing.status}`,
    envelope,
    changes: { status: [from, closing.status], reason: closing.reason },
    payload: await noticePayload(tx, envelope),
  });
}

/** La tarea de la empresa se cierra con su firma. */
export async function closeCompanyTask(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: SigEnvelope,
): Promise<void> {
  if (envelope.workflowInstanceId === null) return;
  await closeWorkflowAsOwner(tx, actor, {
    instanceId: envelope.workflowInstanceId,
    action: SIGNATURE_ACTIONS.sign,
    comment: null,
  });
}
