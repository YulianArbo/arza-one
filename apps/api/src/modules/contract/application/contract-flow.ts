import type { CtrContract, Prisma } from '../../../generated/prisma/client.js';
import { hasPermission } from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  requestTransition,
  startWorkflow,
  taskActorOf,
  type TransitionNotice,
  type WfContext,
} from '../../wf/index.js';
import { APPROVAL_STATES, CONTRACT_FLOW } from '../domain/contract-flows.js';
import { reviewInCard, selfApproval } from './contract-messages.js';
import { contractAudit, contractEventPayload, findContract } from './contract-records.js';
import {
  recordContractChange,
  type ContractActor,
  type ContractRequester,
} from './contract-support.js';

// La decisión de la Dirección sobre un contrato en revisión (B24). Se toma desde la ficha del
// contrato o desde Mis tareas; las dos llegan aquí, en la misma transacción que el trámite. Quien lo
// elaboró no lo decide, ni por delegación. Un contrato con cláusulas modificadas solo se aprueba
// desde la ficha, donde la Dirección las revisa una por una.

export function assertNotAuthor(
  record: { readonly createdBy: string | null },
  userId: string | null,
  onBehalfOf: string | null,
  what: string,
): void {
  const author = record.createdBy;
  if (author !== null && (userId === author || onBehalfOf === author)) throw selfApproval(what);
}

/** Mueve el contrato si sigue en revisión; devuelve falso si otro paso ya lo movió. */
async function moveFromReview(
  tx: TenantTransaction,
  contract: CtrContract,
  data: Prisma.CtrContractUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await tx.ctrContract.updateMany({
    where: { id: contract.id, status: 'in_review', deletedAt: null },
    data,
  });
  return count > 0;
}

export interface ApprovalNote {
  readonly comment: string | null;
  readonly legalNote: string | null;
  readonly reviewed: readonly string[];
}

/** Aprobado: el worker prepara su PDF definitivo y desde entonces el contrato no cambia. */
export async function approveContract(
  tx: TenantTransaction,
  actor: ContractActor,
  contract: CtrContract,
  note: ApprovalNote,
): Promise<void> {
  const moved = await moveFromReview(tx, contract, {
    status: 'approved',
    pdfStatus: 'pending',
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: note.comment,
    legalNote: note.legalNote,
  });
  if (!moved) return;
  await recordContractChange(tx, actor, {
    action: 'contract.approve',
    event: 'contract.approved',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: {
      ...contractAudit(contract),
      status: ['in_review', 'approved'],
      comment: note.comment,
      legal_note: note.legalNote,
      reviewed_clause_ids: [...note.reviewed],
    },
    payload: contractEventPayload(contract),
  });
}

/** Devuelto: vuelve a borrador con el comentario de la Dirección. */
export async function returnContract(
  tx: TenantTransaction,
  actor: ContractActor,
  contract: CtrContract,
  comment: string,
): Promise<void> {
  const moved = await moveFromReview(tx, contract, {
    status: 'draft',
    submittedAt: null,
    decidedBy: actor.userId,
    decidedAt: actor.at,
    decisionNote: comment,
  });
  if (!moved) return;
  await recordContractChange(tx, actor, {
    action: 'contract.return',
    event: 'contract.returned',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: { ...contractAudit(contract), status: ['in_review', 'draft'], comment },
    payload: contractEventPayload(contract),
  });
}

/** Oyente del trámite: si la Dirección decide desde Mis tareas, el contrato cambia con ella. */
export async function followContractFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const contract = await findContract(tx, notice.entityId);
  // Desde la ficha el contrato ya cambió antes de cerrar la tarea: no hay nada más que hacer.
  if (contract.status !== 'in_review') return;
  assertNotAuthor(contract, context.userId, notice.onBehalfOf, 'el contrato');
  if (notice.toState === APPROVAL_STATES.approved) {
    if (contract.hasModifiedClauses) throw reviewInCard();
    await approveContract(tx, context, contract, {
      comment: notice.comment,
      legalNote: null,
      reviewed: [],
    });
  } else if (notice.toState === APPROVAL_STATES.returned) {
    await returnContract(tx, context, contract, notice.comment ?? 'Devuelto para corregir.');
  }
}

/** La Dirección recibe en Mis tareas «Aprobar el contrato …». */
export async function startContractApproval(
  tx: TenantTransaction,
  actor: ContractActor,
  contract: Pick<CtrContract, 'id' | 'code' | 'title'>,
): Promise<void> {
  const instance = await startWorkflow(tx, actor, {
    key: CONTRACT_FLOW,
    entityType: CONTRACT_FLOW,
    entityId: contract.id,
    title: `Aprobar el contrato ${contract.code}: ${contract.title}`,
    facts: {},
  });
  await tx.ctrContract.update({
    where: { id: contract.id },
    data: { workflowInstanceId: instance.id },
  });
}

/** Cierra la tarea de la Dirección con la misma decisión, si el registro la tenía. */
export async function closeApprovalTask(
  tx: TenantTransaction,
  actor: ContractActor,
  requester: ContractRequester,
  instanceId: string | null,
  step: { readonly action: string; readonly comment: string | null },
): Promise<void> {
  if (instanceId === null) return;
  const taskActor = await taskActorOf(tx, requester.principal, requester.ability, actor.at);
  await requestTransition(tx, actor, {
    instanceId,
    action: step.action,
    comment: step.comment,
    facts: {},
    actor: taskActor,
    hasPermission: (code) => hasPermission(requester.ability, code),
  });
}
