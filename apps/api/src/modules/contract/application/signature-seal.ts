import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { putAmendmentInForce } from './amendments.js';
import { contractAudit } from './contract-records.js';
import type { ContractActor } from './contract-support.js';
import { signatureStatusInvalid } from './signature-messages.js';
import { noticePayload } from './signature-progress.js';
import {
  appendSignatureEvent,
  recordSignatureChange,
  type EnvelopeWithSigners,
} from './signature-records.js';
import { envelopeDocument } from './signature-sources.js';

// El documento firmado por todos rige (B25, numeral 13.3 «envelope.completed»): el contrato queda
// vigente con el PDF firmado como su copia firmada, o el otrosí rige y cambia el contrato. Cada
// firmante recibe su copia íntegra, y el responsable, el aviso.

interface Sealed {
  readonly signedFileId: string;
  readonly signedSha256: string;
}

async function contractInForce(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  sealed: Sealed,
  signedOn: string,
): Promise<void> {
  const contract = (await envelopeDocument(tx, envelope)).contract;
  const { count } = await tx.ctrContract.updateMany({
    where: { id: contract.id, status: 'in_signature' },
    data: {
      status: 'active',
      signedFileId: sealed.signedFileId,
      signedOn: fromCalendarDate(signedOn),
    },
  });
  if (count === 0) throw signatureStatusInvalid('El contrato ya no estaba en firma.');
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'system' },
    action: 'contract.signature.electronic',
    entityType: 'ctr_contract',
    entityId: contract.id,
    result: 'success',
    changes: {
      ...contractAudit(contract),
      status: ['in_signature', 'active'],
      signed_file_id: sealed.signedFileId,
      signed_on: signedOn,
      method: 'electronic',
      envelope_code: envelope.code,
    },
    meta: null,
  });
}

async function amendmentInForce(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  sealed: Sealed,
  signedOn: string,
): Promise<void> {
  const { contract, amendment } = await envelopeDocument(tx, envelope);
  if (amendment === null) return;
  const { count } = await tx.ctrAmendment.updateMany({
    where: { id: amendment.id, status: 'in_signature' },
    data: {
      status: 'signed',
      signedFileId: sealed.signedFileId,
      signedOn: fromCalendarDate(signedOn),
    },
  });
  if (count === 0) throw signatureStatusInvalid('El otrosí ya no estaba en firma.');
  await putAmendmentInForce(tx, actor, contract, amendment, {
    file_id: sealed.signedFileId,
    signed_on: signedOn,
    method: 'electronic',
  });
}

export async function putDocumentInForce(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: EnvelopeWithSigners,
  sealed: Sealed,
): Promise<void> {
  const signedOn = bogotaToday(envelope.completedAt ?? actor.at);
  if (envelope.amendmentId === null) {
    await contractInForce(tx, actor, envelope, sealed, signedOn);
  } else {
    await amendmentInForce(tx, actor, envelope, sealed, signedOn);
  }
  await tx.sigSigner.updateMany({
    where: { envelopeId: envelope.id, status: 'signed' },
    data: { mailPending: 'copy' },
  });
  await appendSignatureEvent(tx, envelope.id, actor.at, {
    type: 'sealed',
    signerId: null,
    ip: null,
    userAgent: null,
    details: { signed_sha256: sealed.signedSha256 },
  });
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.seal',
    // El evento del numeral 13.3: Contratos, Proyectos (B26) y el expediente lo consumen.
    event: 'envelope.completed',
    envelope,
    changes: { signed_file_id: sealed.signedFileId, signed_sha256: sealed.signedSha256 },
    payload: { ...(await noticePayload(tx, envelope)), signed_on: signedOn },
  });
}
