import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { stateOf } from '../domain/engine.js';
import type { TaskActor } from '../domain/task-rules.js';
import { findFlow } from '../infrastructure/flow-store.js';
import { decideApproval } from './approvals.js';
import { lockInstance, openTasksOf } from './runtime.js';
import type { WfContext } from './wf-context.js';
import { instanceNotFound, transitionRejected } from './wf-messages.js';
import { attendingTask } from './workflow-engine.js';

// Aprobar o rechazar desde la ficha del registro (B19): los módulos que muestran el paso en su
// propia pantalla deciden la tarea de aprobación que la persona atiende, igual que en «Mis
// tareas». Si la persona no tiene una tarea de aprobación abierta en el trámite, no le corresponde.

export interface ParticipantDecision {
  readonly instanceId: string;
  readonly actor: TaskActor;
  readonly decision: 'approved' | 'rejected';
  readonly comment: string | null;
}

export async function decideAsParticipant(
  tx: TenantTransaction,
  context: WfContext,
  ask: ParticipantDecision,
): Promise<void> {
  const instance = await lockInstance(tx, ask.instanceId);
  if (instance === null) throw instanceNotFound();
  const approvals = (await openTasksOf(tx, instance.id)).filter((t) => t.kind === 'approval');
  const attending = attendingTask(approvals, ask.actor);
  if (attending === null) throw transitionRejected('not_participant');
  await decideApproval(tx, context, {
    task: attending.task,
    approverId: ask.actor.userId,
    decision: ask.decision,
    comment: ask.comment,
    onBehalfOf: attending.onBehalfOf,
  });
}

/** En qué paso va el trámite y si la persona lo atiende ahora (con una tarea abierta suya). */
export interface Participation {
  readonly stateKey: string;
  readonly stateLabel: string;
  readonly completed: boolean;
  readonly attendsApproval: boolean;
  readonly attendsAction: boolean;
}

export async function participationOf(
  tx: TenantTransaction,
  instanceId: string,
  actor: TaskActor,
): Promise<Participation | null> {
  const instance = await tx.workflowInstance.findFirst({
    where: { id: instanceId, deletedAt: null },
  });
  const flow = instance === null ? null : await findFlow(tx, instance.definitionId);
  if (instance === null || flow === null) return null;
  const open = await openTasksOf(tx, instance.id);
  const attends = (kind: string) =>
    attendingTask(
      open.filter((task) => task.kind === kind),
      actor,
    ) !== null;
  return {
    stateKey: instance.currentState,
    stateLabel: stateOf(flow, instance.currentState).label,
    completed: instance.completedAt !== null,
    attendsApproval: attends('approval'),
    attendsAction: attends('action'),
  };
}
