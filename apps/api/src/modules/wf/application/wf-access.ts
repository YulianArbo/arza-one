import type { AvailableAction, PermissionCode } from '@arza/contracts';

import type { WorkflowInstance, WorkflowTask } from '../../../generated/prisma/client.js';
import {
  canOnRecord,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { offeredActions, type Flow } from '../domain/engine.js';
import type { TaskActor } from '../domain/task-rules.js';
import { stateRef } from './wf-views.js';
import { attendingTask, assignmentOf } from './workflow-engine.js';
import { factsOf } from './runtime.js';
import { taskReason } from '../domain/task-rules.js';

// Quién ve un trámite y qué puede hacer en él (numeral 15.5): quien tiene «ver todas las tareas»,
// o quien participa en él. A los demás el trámite les responde «no existe».

/** Personas relacionadas con el trámite: quien lo inició, quienes tuvieron tareas o actuaron. */
export async function involvedUsers(
  tx: TenantTransaction,
  instance: WorkflowInstance,
): Promise<Set<string>> {
  const [tasks, steps] = await Promise.all([
    tx.workflowTask.findMany({ where: { instanceId: instance.id } }),
    tx.workflowHistory.findMany({ where: { instanceId: instance.id }, select: { actorId: true } }),
  ]);
  const ids = [
    instance.startedBy,
    ...tasks.flatMap((t) => [t.assigneeId, t.escalatedToId, t.delegatedFromId, t.completedBy]),
    ...steps.map((step) => step.actorId),
  ];
  return new Set(ids.filter((id): id is string => id !== null));
}

/** Permisos de la persona sobre este trámite: «solo lo propio» vale si participa en él. */
export function permissionCheck(ability: AppAbility, involved: ReadonlySet<string>) {
  const record = { involved_user_ids: [...involved] };
  return (code: PermissionCode): boolean => canOnRecord(ability, code, record);
}

export interface InstanceAccess {
  readonly visible: boolean;
  readonly involved: ReadonlySet<string>;
}

export async function instanceAccess(
  tx: TenantTransaction,
  instance: WorkflowInstance,
  actor: TaskActor,
  ability: AppAbility,
): Promise<InstanceAccess> {
  const involved = await involvedUsers(tx, instance);
  const open = await tx.workflowTask.findMany({
    where: { instanceId: instance.id, completedAt: null },
  });
  const visible =
    hasUnconditionalPermission(ability, 'wf.task.read_all') ||
    involved.has(actor.userId) ||
    attendingTask(open, actor) !== null;
  return { visible, involved };
}

/** Las acciones que la persona puede pedir en el estado actual, para los botones. */
export function actionsFor(
  flow: Flow,
  instance: WorkflowInstance,
  request: {
    readonly attendsState: boolean;
    readonly hasPermission: (code: PermissionCode) => boolean;
  },
): AvailableAction[] {
  if (instance.completedAt !== null) return [];
  const offered = offeredActions(flow, instance.currentState, {
    ...request,
    facts: factsOf(instance),
  });
  return offered.map(({ transition, conditionMet }) => ({
    action: transition.action,
    label: transition.label,
    to_state: stateRef(flow.states, transition.to_state),
    requires_comment: transition.requires_comment,
    condition_met: conditionMet,
  }));
}

/** La persona atiende el estado actual: con una de sus tareas o, sin tareas, porque lo inició. */
export function attendsState(
  instance: WorkflowInstance,
  open: readonly WorkflowTask[],
  actor: TaskActor,
): boolean {
  if (open.length === 0) return instance.startedBy === actor.userId;
  return open.some((task) => taskReason(assignmentOf(task), actor) !== null);
}
