import type { CtrAmendment, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { startWorkflow, type TransitionNotice, type WfContext } from '../../wf/index.js';
import { AMENDMENT_FLOW, APPROVAL_STATES } from '../domain/contract-flows.js';
import { contractNotFound } from './contract-messages.js';
import { assertNotAuthor } from './contract-flow.js';
import { recordContractChange, type ContractActor } from './contract-support.js';

// La decisión de la Dirección sobre un otrosí (B24), desde la ficha del contrato o desde Mis
// tareas, en la misma transacción que el trámite. Quien lo elaboró no lo decide.

export async function findAmendment(
  tx: TenantTransaction,
  contractId: string,
  id: string,
): Promise<CtrAmendment> {
  const amendment = await tx.ctrAmendment.findFirst({
    where: { id, contractId, deletedAt: null },
  });
  if (amendment === null) throw contractNotFound('El otrosí');
  return amendment;
}

export function amendmentAudit(amendment: CtrAmendment): Record<string, string | null> {
  return {
    code: amendment.code,
    kind: amendment.kind,
    status: amendment.status,
    summary: amendment.summary,
    new_value: amendment.newValue === null ? null : amendment.newValue.toFixed(2),
  };
}

function eventPayload(amendment: CtrAmendment): Prisma.InputJsonObject {
  return {
    code: amendment.code,
    contract_id: amendment.contractId,
    author_id: amendment.createdBy,
  };
}

async function moveFromReview(
  tx: TenantTransaction,
  amendment: CtrAmendment,
  data: Prisma.CtrAmendmentUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await tx.ctrAmendment.updateMany({
    where: { id: amendment.id, status: 'in_review', deletedAt: null },
    data,
  });
  return count > 0;
}

/** Aprobado: el worker prepara su PDF; rige cuando se registra la copia firmada. */
export async function approveAmendment(
  tx: TenantTransaction,
  actor: ContractActor,
  amendment: CtrAmendment,
  comment: string | null,
): Promise<void> {
  const data = {
    status: 'approved',
    pdfStatus: 'pending',
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: comment,
  };
  if (!(await moveFromReview(tx, amendment, data))) return;
  await recordContractChange(tx, actor, {
    action: 'contract.amendment.approve',
    event: 'contract.amendment.approved',
    entityType: 'ctr_amendment',
    entityId: amendment.id,
    changes: { ...amendmentAudit(amendment), status: ['in_review', 'approved'], comment },
    payload: eventPayload(amendment),
  });
}

/** Devuelto: no rige; quien lo elaboró crea otro con lo que pidió la Dirección. */
export async function returnAmendment(
  tx: TenantTransaction,
  actor: ContractActor,
  amendment: CtrAmendment,
  comment: string,
): Promise<void> {
  const data = {
    status: 'returned',
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: comment,
  };
  if (!(await moveFromReview(tx, amendment, data))) return;
  await recordContractChange(tx, actor, {
    action: 'contract.amendment.return',
    event: 'contract.amendment.returned',
    entityType: 'ctr_amendment',
    entityId: amendment.id,
    changes: { ...amendmentAudit(amendment), status: ['in_review', 'returned'], comment },
    payload: eventPayload(amendment),
  });
}

export async function followAmendmentFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const amendment = await tx.ctrAmendment.findFirst({
    where: { id: notice.entityId, deletedAt: null },
  });
  if (amendment === null) throw contractNotFound('El otrosí');
  if (amendment.status !== 'in_review') return;
  assertNotAuthor(amendment, context.userId, notice.onBehalfOf, 'el otrosí');
  if (notice.toState === APPROVAL_STATES.approved) {
    await approveAmendment(tx, context, amendment, notice.comment);
  } else if (notice.toState === APPROVAL_STATES.returned) {
    await returnAmendment(tx, context, amendment, notice.comment ?? 'Devuelto para corregir.');
  }
}

export async function startAmendmentApproval(
  tx: TenantTransaction,
  actor: ContractActor,
  amendment: Pick<CtrAmendment, 'id' | 'code' | 'summary'>,
): Promise<void> {
  const instance = await startWorkflow(tx, actor, {
    key: AMENDMENT_FLOW,
    entityType: AMENDMENT_FLOW,
    entityId: amendment.id,
    title: `Aprobar el otrosí ${amendment.code}: ${amendment.summary}`,
    facts: {},
  });
  await tx.ctrAmendment.update({
    where: { id: amendment.id },
    data: { workflowInstanceId: instance.id },
  });
}
