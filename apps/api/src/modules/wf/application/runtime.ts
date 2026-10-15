import {
  APPROVAL_ACTIONS,
  workflowFactsSchema,
  type Participant,
  type PermissionCode,
  type StateInput,
  type TransitionInput,
  type WorkflowFacts,
} from '@arza/contracts';

import type { WorkflowInstance, WorkflowTask } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { businessHoursDeadline } from '../../core/index.js';
import { firstApprovers, stateOf, type Flow } from '../domain/engine.js';
import { OPEN_STATUSES } from '../domain/task-rules.js';
import { auditWf, supervisorOf, type WfContext } from './wf-context.js';

// El motor en ejecución (numeral 13.2): registra el historial, crea las tareas del nuevo estado y
// calcula sus vencimientos en horas hábiles. Todo dentro de la transacción del caso de uso.

/** Bloquea el trámite: dos personas no pueden moverlo al mismo tiempo. */
export async function lockInstance(
  tx: TenantTransaction,
  id: string,
): Promise<WorkflowInstance | null> {
  await tx.$queryRaw`SELECT id FROM wf_instances WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.workflowInstance.findFirst({ where: { id, deletedAt: null } });
}

export function factsOf(instance: WorkflowInstance): WorkflowFacts {
  const parsed = workflowFactsSchema.safeParse(instance.facts);
  return parsed.success ? parsed.data : {};
}

/** La llegada al estado actual: el paso más reciente del historial. */
export async function currentEntryId(tx: TenantTransaction, instanceId: string): Promise<string> {
  const entry = await tx.workflowHistory.findFirstOrThrow({
    where: { instanceId },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  return entry.id;
}

export async function openTasksOf(
  tx: TenantTransaction,
  instanceId: string,
): Promise<WorkflowTask[]> {
  return tx.workflowTask.findMany({
    where: { instanceId, status: { in: [...OPEN_STATUSES] }, deletedAt: null },
    orderBy: { sequence: 'asc' },
  });
}

async function assigneeOf(
  tx: TenantTransaction,
  participant: Participant,
  startedBy: string | null,
): Promise<{ assigneeId: string | null; assigneeRole: string | null }> {
  if (participant.type === 'role') return { assigneeId: null, assigneeRole: participant.role };
  const person = participant.type === 'initiator' ? startedBy : await supervisorOf(tx, startedBy);
  return { assigneeId: person, assigneeRole: null };
}

export interface TaskPlan {
  readonly instance: WorkflowInstance;
  readonly state: StateInput;
  readonly entryId: string;
  readonly dueAt: Date | null;
  readonly kind: 'action' | 'approval';
  readonly sequence: number;
  readonly participant: Participant;
  readonly requiredPermission: PermissionCode | null;
}

/** Crea una tarea y avisa por la bandeja de salida (B16 la hace llegar a la persona). */
export async function createTask(
  tx: TenantTransaction,
  context: WfContext,
  plan: TaskPlan,
): Promise<WorkflowTask> {
  const { instance, state } = plan;
  const assignee = await assigneeOf(tx, plan.participant, instance.startedBy);
  const task = await tx.workflowTask.create({
    data: {
      tenantId: context.tenantId,
      instanceId: instance.id,
      entryId: plan.entryId,
      stateKey: state.key,
      title: `${state.label}: ${instance.title}`,
      kind: plan.kind,
      sequence: plan.sequence,
      ...assignee,
      requiredPermission: plan.requiredPermission,
      priority: state.priority,
      dueAt: plan.dueAt,
    },
  });
  await addOutboxEvent(tx, {
    tenantId: context.tenantId,
    eventType: 'wf.task.assigned',
    actorId: context.userId,
    occurredAt: context.at,
    payload: { task_id: task.id, instance_id: instance.id, assignee_id: task.assigneeId },
  });
  return task;
}

/** Permiso de la transición «approve»: el que se puede delegar para atender la aprobación. */
function approvalPermission(flow: Flow, state: StateInput): PermissionCode | null {
  const approve = flow.transitions.find(
    (t) => t.from_state === state.key && t.action === APPROVAL_ACTIONS.approve,
  );
  return approve?.required_permission ?? null;
}

async function createStateTasks(
  tx: TenantTransaction,
  context: WfContext,
  flow: Flow,
  base: Omit<TaskPlan, 'kind' | 'sequence' | 'participant' | 'requiredPermission'>,
): Promise<void> {
  const { state } = base;
  if (state.approval !== null) {
    const requiredPermission = approvalPermission(flow, state);
    for (const sequence of firstApprovers(state.approval)) {
      const participant = state.approval.approvers[sequence];
      if (participant === undefined) continue;
      const plan = {
        ...base,
        kind: 'approval',
        sequence,
        participant,
        requiredPermission,
      } as const;
      await createTask(tx, context, plan);
    }
  } else if (state.assignee !== null && state.kind !== 'final') {
    const plan = { ...base, kind: 'action', sequence: 0, participant: state.assignee } as const;
    await createTask(tx, context, { ...plan, requiredPermission: null });
  }
}

/** Entra al estado: plazo en horas hábiles, fin del trámite si es final y tareas nuevas. */
export async function enterState(
  tx: TenantTransaction,
  context: WfContext,
  flow: Flow,
  target: {
    readonly instance: WorkflowInstance;
    readonly stateKey: string;
    readonly entryId: string;
  },
): Promise<WorkflowInstance> {
  const state = stateOf(flow, target.stateKey);
  const hours = state.sla_hours;
  const dueAt = hours === null ? null : await businessHoursDeadline(tx, context.at, hours);
  const instance = await tx.workflowInstance.update({
    where: { id: target.instance.id },
    data: {
      currentState: state.key,
      dueAt,
      completedAt: state.kind === 'final' ? context.at : null,
    },
  });
  await createStateTasks(tx, context, flow, { instance, state, entryId: target.entryId, dueAt });
  return instance;
}

export interface AppliedTransition {
  readonly instance: WorkflowInstance;
  readonly flow: Flow;
  readonly transition: TransitionInput;
  readonly comment: string | null;
  /** A nombre de quién actúa, por una delegación de aprobaciones. */
  readonly onBehalfOf: string | null;
  /** La tarea con la que se completa el paso: queda completada; las demás, canceladas. */
  readonly taskId: string | null;
}

async function closeOpenTasks(tx: TenantTransaction, context: WfContext, step: AppliedTransition) {
  const open = { instanceId: step.instance.id, status: { in: [...OPEN_STATUSES] } };
  const done = { completedAt: context.at, completedBy: context.userId };
  if (step.taskId !== null) {
    await tx.workflowTask.updateMany({
      where: { ...open, id: step.taskId },
      data: { ...done, status: 'completed' },
    });
  }
  await tx.workflowTask.updateMany({ where: open, data: { ...done, status: 'cancelled' } });
}

/** Deja la transición en la auditoría y avisa a los módulos por la bandeja de salida. */
async function announceTransition(
  tx: TenantTransaction,
  context: WfContext,
  instance: WorkflowInstance,
  transition: TransitionInput,
): Promise<void> {
  const changes = {
    from: transition.from_state,
    to: transition.to_state,
    action: transition.action,
  };
  await auditWf(tx, context, {
    action: 'wf.instance.transition',
    entityType: 'wf_instance',
    entityId: instance.id,
    changes,
  });
  await addOutboxEvent(tx, {
    tenantId: context.tenantId,
    eventType: 'wf.instance.transitioned',
    actorId: context.userId,
    occurredAt: context.at,
    payload: {
      instance_id: instance.id,
      entity_type: instance.entityType,
      entity_id: instance.entityId,
      ...changes,
    },
  });
}

/**
 * Hace la transición, ya validada: cierra las tareas abiertas, registra el paso en el historial,
 * entra al nuevo estado y avisa a los módulos por la bandeja de salida (numeral 13.3).
 */
export async function applyTransition(
  tx: TenantTransaction,
  context: WfContext,
  step: AppliedTransition,
): Promise<WorkflowInstance> {
  const { instance, transition } = step;
  await closeOpenTasks(tx, context, step);
  const entry = await tx.workflowHistory.create({
    data: {
      tenantId: context.tenantId,
      instanceId: instance.id,
      fromState: transition.from_state,
      toState: transition.to_state,
      action: transition.action,
      actorId: context.userId,
      onBehalfOf: step.onBehalfOf,
      comment: step.comment,
      occurredAt: context.at,
    },
  });
  const target = { instance, stateKey: transition.to_state, entryId: entry.id };
  const moved = await enterState(tx, context, step.flow, target);
  await announceTransition(tx, context, instance, transition);
  return moved;
}
