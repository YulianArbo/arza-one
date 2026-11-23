import {
  isPermissionCode,
  taskStatusSchema,
  type PermissionCode,
  type WorkflowFacts,
} from '@arza/contracts';

import type { WorkflowInstance, WorkflowTask } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { findTransition, initialState, transitionProblem } from '../domain/engine.js';
import { taskReason, type TaskActor, type TaskAssignment } from '../domain/task-rules.js';
import {
  findFlow,
  lockFlowVersions,
  publishedFlow,
  type StoredFlow,
} from '../infrastructure/flow-store.js';
import { applyTransition, enterState, factsOf, lockInstance, openTasksOf } from './runtime.js';
import { auditWf, type WfContext } from './wf-context.js';
import {
  definitionInvalid,
  instanceActive,
  instanceNotFound,
  noPublishedVersion,
  transitionRejected,
} from './wf-messages.js';

// Entrada del motor para todos los módulos (numeral 13.2): iniciar el flujo de un registro y pedir
// una transición. Se usan dentro de la transacción del caso de uso del módulo que los llama.

export function assignmentOf(task: WorkflowTask): TaskAssignment {
  const permission = task.requiredPermission;
  return {
    kind: task.kind === 'approval' ? 'approval' : 'action',
    status: taskStatusSchema.parse(task.status),
    assigneeId: task.assigneeId,
    assigneeRole: task.assigneeRole,
    requiredPermission: permission !== null && isPermissionCode(permission) ? permission : null,
    escalatedToId: task.escalatedToId,
    escalatedAt: task.escalatedAt,
  };
}

export interface StartRequest {
  /** Clave del flujo: se usa su versión publicada. */
  readonly key: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly facts: WorkflowFacts;
  /**
   * A nombre de quién corre el trámite cuando lo inicia el sistema (B24: la alerta de vencimiento
   * de un contrato es del responsable del contrato). Vacío: quien lo inicia.
   */
  readonly initiator?: string;
  /** Fecha límite fija de la primera tarea, en lugar de las horas hábiles del estado (B42). */
  readonly dueAt?: Date;
}

/** El registro tiene un trámite abierto de ese tipo. */
export async function hasActiveWorkflow(
  tx: TenantTransaction,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const active = await tx.workflowInstance.count({
    where: { entityType, entityId, completedAt: null, deletedAt: null },
  });
  return active > 0;
}

async function assertNoActiveInstance(tx: TenantTransaction, request: StartRequest) {
  if (await hasActiveWorkflow(tx, request.entityType, request.entityId)) throw instanceActive();
}

async function startableFlow(tx: TenantTransaction, request: StartRequest): Promise<StoredFlow> {
  await lockFlowVersions(tx, request.key);
  const flow = await publishedFlow(tx, request.key);
  if (flow === null) throw noPublishedVersion();
  if (flow.entityType !== request.entityType) {
    throw definitionInvalid(['El flujo no corresponde a este tipo de registro.']);
  }
  await assertNoActiveInstance(tx, request);
  return flow;
}

/** Inicia el flujo del registro con la versión publicada. Devuelve el trámite. */
export async function startWorkflow(
  tx: TenantTransaction,
  context: WfContext,
  request: StartRequest,
): Promise<WorkflowInstance> {
  const flow = await startableFlow(tx, request);
  const initial = initialState(flow);
  const created = await tx.workflowInstance.create({
    data: {
      tenantId: context.tenantId,
      definitionId: flow.id,
      entityType: request.entityType,
      entityId: request.entityId,
      title: request.title,
      currentState: initial.key,
      facts: { ...request.facts },
      startedBy: request.initiator ?? context.userId,
      startedAt: context.at,
    },
  });
  const entry = await tx.workflowHistory.create({
    data: {
      tenantId: context.tenantId,
      instanceId: created.id,
      toState: initial.key,
      action: 'start',
      actorId: context.userId,
      occurredAt: context.at,
    },
  });
  const target = {
    instance: created,
    stateKey: initial.key,
    entryId: entry.id,
    ...(request.dueAt === undefined ? {} : { dueAt: request.dueAt }),
  };
  const instance = await enterState(tx, context, flow, target);
  await recordStart(tx, context, instance, flow);
  return instance;
}

async function recordStart(
  tx: TenantTransaction,
  context: WfContext,
  instance: WorkflowInstance,
  flow: StoredFlow,
): Promise<void> {
  const changes = {
    entity_type: instance.entityType,
    entity_id: instance.entityId,
    workflow_key: flow.key,
    workflow_version: flow.versionNumber,
  };
  await auditWf(tx, context, {
    action: 'wf.instance.start',
    entityType: 'wf_instance',
    entityId: instance.id,
    changes: { ...changes, title: instance.title },
  });
  await addOutboxEvent(tx, {
    tenantId: context.tenantId,
    eventType: 'wf.instance.started',
    actorId: context.userId,
    occurredAt: context.at,
    payload: { instance_id: instance.id, ...changes },
  });
}

export interface TransitionAsk {
  readonly instanceId: string;
  readonly action: string;
  readonly comment: string | null;
  /** Datos nuevos del registro para las condiciones; se guardan en el trámite. */
  readonly facts: WorkflowFacts;
  readonly actor: TaskActor;
  readonly hasPermission: (code: PermissionCode) => boolean;
}

/** La tarea abierta con la que la persona atiende el paso, y a nombre de quién. */
export function attendingTask(
  open: readonly WorkflowTask[],
  actor: TaskActor,
): { readonly task: WorkflowTask; readonly onBehalfOf: string | null } | null {
  for (const task of open) {
    const reason = taskReason(assignmentOf(task), actor);
    if (reason !== null) {
      return { task, onBehalfOf: reason === 'delegation' ? task.assigneeId : null };
    }
  }
  return null;
}

/** Valida y hace la transición pedida por una persona. Una no definida es imposible. */
export async function requestTransition(
  tx: TenantTransaction,
  context: WfContext,
  ask: TransitionAsk,
): Promise<WorkflowInstance> {
  const instance = await lockInstance(tx, ask.instanceId);
  if (instance === null) throw instanceNotFound();
  const flow = await findFlow(tx, instance.definitionId);
  if (flow === null) throw instanceNotFound();
  const open = await openTasksOf(tx, instance.id);
  const attending = attendingTask(open, ask.actor);
  const initiator = open.length === 0 && instance.startedBy === ask.actor.userId;
  const facts = { ...factsOf(instance), ...ask.facts };
  const problem = transitionProblem(flow, instance.currentState, {
    ...ask,
    facts,
    attendsState: attending !== null || initiator,
    fromApprovals: false,
  });
  const transition = findTransition(flow, instance.currentState, ask.action);
  if (problem !== null || transition === null) throw transitionRejected(problem ?? 'not_defined');
  if (Object.keys(ask.facts).length > 0) {
    await tx.workflowInstance.update({ where: { id: instance.id }, data: { facts } });
  }
  return applyTransition(tx, context, {
    instance,
    flow,
    transition,
    comment: ask.comment,
    onBehalfOf: attending?.onBehalfOf ?? null,
    taskId: attending?.task.id ?? null,
  });
}

/**
 * El módulo dueño del registro cierra el trámite por su cuenta, sin una persona que atienda la
 * tarea: por ejemplo, cuando el proceso de firma termina, se anula o vence (B25). Hace la transición
 * definida desde el estado actual; si el trámite ya no está en ese punto, no hace nada.
 */
export async function closeWorkflowAsOwner(
  tx: TenantTransaction,
  context: WfContext,
  ask: { readonly instanceId: string; readonly action: string; readonly comment: string | null },
): Promise<boolean> {
  const instance = await lockInstance(tx, ask.instanceId);
  if (instance === null) return false;
  if (instance.completedAt !== null) return false;
  const flow = await findFlow(tx, instance.definitionId);
  const transition = flow === null ? null : findTransition(flow, instance.currentState, ask.action);
  if (flow === null || transition === null) return false;
  await applyTransition(tx, context, {
    instance,
    flow,
    transition,
    comment: ask.comment,
    onBehalfOf: null,
    taskId: null,
  });
  return true;
}
