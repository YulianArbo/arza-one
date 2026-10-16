import { APPROVAL_ACTIONS } from '@arza/contracts';

import type { WorkflowTask } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  approvalOutcome,
  findTransition,
  stateOf,
  transitionProblem,
  type Decision,
  type Flow,
} from '../domain/engine.js';
import { findFlow } from '../infrastructure/flow-store.js';
import { applyTransition, createTask, factsOf, lockInstance } from './runtime.js';
import { auditWf, type WfContext } from './wf-context.js';
import { assignmentOf } from './workflow-engine.js';
import { instanceNotFound, transitionRejected } from './wf-messages.js';

// Aprobaciones en serie y en paralelo (ficha 17.5): cada decisión queda en wf_approvals; el motor
// crea la tarea del siguiente aprobador o, con todas aprobadas o un rechazo, hace la transición.

export interface ApprovalDecision {
  readonly task: WorkflowTask;
  readonly approverId: string;
  readonly decision: 'approved' | 'rejected';
  readonly comment: string | null;
  /** A nombre de quién decide, por una delegación de aprobaciones. */
  readonly onBehalfOf: string | null;
}

async function recordDecision(
  tx: TenantTransaction,
  context: WfContext,
  { task, approverId, decision, comment, onBehalfOf }: ApprovalDecision,
): Promise<void> {
  await tx.workflowApproval.create({
    data: {
      tenantId: context.tenantId,
      taskId: task.id,
      approverId,
      onBehalfOf,
      decision,
      comment,
      decidedAt: context.at,
    },
  });
  await tx.workflowTask.update({
    where: { id: task.id },
    data: { status: 'completed', completedAt: context.at, completedBy: context.userId },
  });
  await auditWf(tx, context, {
    action: decision === 'approved' ? 'wf.task.approve' : 'wf.task.reject',
    entityType: 'wf_task',
    entityId: task.id,
    changes: { instance_id: task.instanceId, on_behalf_of: onBehalfOf },
  });
}

/** Decisiones ya tomadas en esta llegada al estado, con el lugar de cada aprobador. */
async function decisionsOf(tx: TenantTransaction, entryId: string): Promise<Decision[]> {
  const tasks = await tx.workflowTask.findMany({
    where: { entryId, kind: 'approval', deletedAt: null },
    select: { sequence: true, approvals: { select: { decision: true } } },
  });
  return tasks.flatMap((task) =>
    task.approvals.map((approval): Decision => ({
      sequence: task.sequence,
      decision: approval.decision === 'rejected' ? 'rejected' : 'approved',
    })),
  );
}

async function finishState(
  tx: TenantTransaction,
  context: WfContext,
  step: { flow: Flow; action: string; decision: ApprovalDecision; instanceId: string },
) {
  const instance = await lockInstance(tx, step.instanceId);
  if (instance === null) throw instanceNotFound();
  const ask = {
    action: step.action,
    comment: step.decision.comment,
    facts: factsOf(instance),
    hasPermission: () => true,
    attendsState: true,
    fromApprovals: true,
  };
  const problem = transitionProblem(step.flow, instance.currentState, ask);
  const transition = findTransition(step.flow, instance.currentState, step.action);
  if (problem !== null || transition === null) throw transitionRejected(problem ?? 'not_defined');
  await applyTransition(tx, context, {
    instance,
    flow: step.flow,
    transition,
    comment: step.decision.comment,
    onBehalfOf: step.decision.onBehalfOf,
    taskId: null,
  });
}

/**
 * Registra la decisión y avanza: siguiente aprobador en serie, espera en paralelo, o la
 * transición «approve» o «reject» del estado. La tarea ya fue validada por quien llama.
 */
export async function decideApproval(
  tx: TenantTransaction,
  context: WfContext,
  decision: ApprovalDecision,
): Promise<void> {
  const instance = await lockInstance(tx, decision.task.instanceId);
  const flow = instance === null ? null : await findFlow(tx, instance.definitionId);
  if (instance === null || flow === null) throw instanceNotFound();
  await recordDecision(tx, context, decision);
  const state = stateOf(flow, decision.task.stateKey);
  if (state.approval === null) throw transitionRejected('not_defined');
  const outcome = approvalOutcome(state.approval, await decisionsOf(tx, decision.task.entryId));
  if (outcome.kind === 'wait') return;
  if (outcome.kind === 'next') {
    const participant = state.approval.approvers[outcome.sequence];
    if (participant === undefined) return;
    await createTask(tx, context, {
      instance,
      state,
      entryId: decision.task.entryId,
      dueAt: instance.dueAt,
      kind: 'approval',
      sequence: outcome.sequence,
      participant,
      requiredPermission: assignmentOf(decision.task).requiredPermission,
    });
    return;
  }
  const action = outcome.kind === 'approve' ? APPROVAL_ACTIONS.approve : APPROVAL_ACTIONS.reject;
  await finishState(tx, context, { flow, action, decision, instanceId: instance.id });
}
