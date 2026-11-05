import {
  IN_FORCE_STATUSES,
  type RegisterSignatureRequest,
  type TerminateContractRequest,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { datesInvalid, pdfNotReady } from './contract-messages.js';
import {
  assertContractStatus,
  contractAudit,
  contractEventPayload,
  findContract,
  updateContractVersioned,
} from './contract-records.js';
import {
  recordContractChange,
  type ContractActor,
  type ContractTarget,
} from './contract-support.js';
import { assertSignedCopy } from './signed-copy.js';

// La firma y la terminación de un contrato (B24, ficha 17.7). Mientras llega la firma electrónica
// (B25), se registra la copia del PDF aprobado firmada a mano por todos (firma manuscrita
// digitalizada) y el contrato queda vigente. La Dirección puede terminarlo antes de su plazo.

export async function registerContractSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  principal: Principal,
  target: ContractTarget,
  input: RegisterSignatureRequest,
): Promise<void> {
  const contract = await findContract(tx, target.id);
  assertContractStatus(
    contract,
    ['approved'],
    'Solo se registra la firma de un contrato aprobado.',
  );
  if (contract.pdfStatus !== 'ready') throw pdfNotReady();
  const decided = bogotaToday(contract.decidedAt ?? actor.at);
  await assertSignedCopy(tx, principal, input, {
    notBefore: decided,
    today: bogotaToday(actor.at),
  });
  await updateContractVersioned(tx, target, {
    status: 'active',
    signedFileId: input.file_id,
    signedOn: fromCalendarDate(input.signed_on),
    signedBy: actor.userId,
  });
  await recordContractChange(tx, actor, {
    action: 'contract.signature.register',
    event: 'contract.signed',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: {
      ...contractAudit(contract),
      status: ['approved', 'active'],
      signed_file_id: input.file_id,
      signed_on: input.signed_on,
      method: 'handwritten',
    },
    payload: contractEventPayload(contract),
  });
}

/** Terminación anticipada, con su fecha (entre el inicio y hoy) y su motivo. */
export async function terminateContract(
  tx: TenantTransaction,
  actor: ContractActor,
  target: ContractTarget,
  input: TerminateContractRequest,
): Promise<void> {
  const contract = await findContract(tx, target.id);
  assertContractStatus(contract, IN_FORCE_STATUSES, 'Solo se termina un contrato vigente.');
  const today = bogotaToday(actor.at);
  if (input.terminated_on > today || input.terminated_on < toCalendarDate(contract.startsOn)) {
    throw datesInvalid('La fecha de terminación debe estar entre el inicio del contrato y hoy.');
  }
  await updateContractVersioned(tx, target, {
    status: 'terminated',
    terminatedOn: fromCalendarDate(input.terminated_on),
    terminationReason: input.reason,
    terminatedBy: actor.userId,
    closedAt: actor.at,
  });
  await recordContractChange(tx, actor, {
    action: 'contract.terminate',
    event: 'contract.terminated',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: {
      ...contractAudit(contract),
      status: [contract.status, 'terminated'],
      terminated_on: input.terminated_on,
      reason: input.reason,
    },
    payload: contractEventPayload(contract),
  });
}
