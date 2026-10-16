import { Inject, Injectable } from '@nestjs/common';
import type {
  CompleteTaskRequest,
  DecideTaskRequest,
  HandOverTaskRequest,
  RejectTaskRequest,
} from '@arza/contracts';

import type { WorkflowTask } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { businessHoursDeadline } from '../../core/index.js';
import { activeInternalUserByEmail, isActiveInternalUser } from '../../iam/index.js';
import { stateOf } from '../domain/engine.js';
import { canHandOver, isOpen, taskReason, type TaskActor } from '../domain/task-rules.js';
import { findFlow } from '../infrastructure/flow-store.js';
import { decideApproval } from './approvals.js';
import { lockInstance } from './runtime.js';
import { involvedUsers, permissionCheck } from './wf-access.js';
import { auditWf, contextOf, taskActorOf, type WfContext } from './wf-context.js';
import { personInvalid, taskActionNotAllowed, taskClosed, taskNotFound } from './wf-messages.js';
import { assignmentOf, requestTransition } from './workflow-engine.js';

// Acciones sobre las tareas (numeral 14.3): tomar, completar, aprobar, rechazar, delegar y
// reasignar. Cada una bloquea el trámite, revisa quién la pide y queda en la auditoría.

interface LockedTask {
  readonly task: WorkflowTask;
  readonly actor: TaskActor;
  readonly reason: ReturnType<typeof taskReason>;
}

interface Request {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

@Injectable()
export class TaskActionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Pendiente → en curso. Si la tarea es de un rol, quien la toma queda como responsable. */
  async start(request: Request, id: string): Promise<void> {
    await this.run(request, id, async (tx, context, { task, reason }) => {
      if (reason === null) throw permissionDenied();
      if (task.status !== 'pending') throw taskActionNotAllowed('La tarea ya está en curso.');
      await tx.workflowTask.update({
        where: { id },
        data: {
          status: 'in_progress',
          startedAt: context.at,
          ...(reason === 'role' ? { assigneeId: context.userId } : {}),
        },
      });
      await this.audit(tx, context, 'wf.task.start', task, { reason });
    });
  }

  /** Completa una tarea de acción con una de las transiciones de su estado. */
  async complete(request: Request, id: string, input: CompleteTaskRequest): Promise<void> {
    await this.run(request, id, async (tx, context, { task, actor, reason }) => {
      if (reason === null) throw permissionDenied();
      if (task.kind !== 'action') {
        throw taskActionNotAllowed('Esta tarea se atiende con «Aprobar» o «Rechazar».');
      }
      const instance = await tx.workflowInstance.findFirstOrThrow({
        where: { id: task.instanceId },
      });
      await requestTransition(tx, context, {
        instanceId: task.instanceId,
        action: input.action,
        comment: input.comment ?? null,
        facts: {},
        actor,
        hasPermission: permissionCheck(request.ability, await involvedUsers(tx, instance)),
      });
      await this.audit(tx, context, 'wf.task.complete', task, { action: input.action });
    });
  }

  async approve(request: Request, id: string, input: DecideTaskRequest): Promise<void> {
    await this.decide(request, id, 'approved', input.comment ?? null);
  }

  async reject(request: Request, id: string, input: RejectTaskRequest): Promise<void> {
    await this.decide(request, id, 'rejected', input.comment);
  }

  /** La persona responsable entrega su tarea a otro colaborador; el plazo no cambia. */
  async delegate(request: Request, id: string, input: HandOverTaskRequest): Promise<void> {
    await this.run(request, id, async (tx, context, { task, reason }) => {
      if (!canHandOver(reason)) {
        throw taskActionNotAllowed('Solo la persona responsable puede delegar esta tarea.');
      }
      const receiver = await this.receiverOf(tx, input, request.principal.userId);
      await tx.workflowTask.update({
        where: { id },
        data: {
          assigneeId: receiver,
          delegatedFromId: request.principal.userId,
          ...(task.status === 'in_progress' ? { status: 'pending' } : {}),
        },
      });
      const change = { action: 'wf.task.delegate', receiver, comment: input.comment };
      await this.handedOver(tx, context, task, change);
    });
  }

  /** Quien reasigna tareas la entrega a otra persona con un plazo nuevo desde ahora. */
  async reassign(request: Request, id: string, input: HandOverTaskRequest): Promise<void> {
    await this.run(request, id, async (tx, context, { task }) => {
      const receiver = await this.receiverOf(tx, input, null);
      const instance = await tx.workflowInstance.findFirstOrThrow({
        where: { id: task.instanceId },
      });
      const flow = await findFlow(tx, instance.definitionId);
      const hours = flow === null ? null : stateOf(flow, task.stateKey).sla_hours;
      await tx.workflowTask.update({
        where: { id },
        data: {
          assigneeId: receiver,
          delegatedFromId: null,
          escalatedToId: null,
          escalatedAt: null,
          status: 'pending',
          dueAt: hours === null ? null : await businessHoursDeadline(tx, context.at, hours),
        },
      });
      const change = { action: 'wf.task.reassign', receiver, comment: input.comment };
      await this.handedOver(tx, context, task, change);
    });
  }

  private async decide(
    request: Request,
    id: string,
    decision: 'approved' | 'rejected',
    comment: string | null,
  ): Promise<void> {
    await this.run(request, id, async (tx, context, { task, reason }) => {
      if (reason === null) throw permissionDenied();
      if (task.kind !== 'approval') {
        throw taskActionNotAllowed('Esta tarea se completa con una de las acciones del paso.');
      }
      const onBehalfOf = reason === 'delegation' ? task.assigneeId : null;
      const approverId = request.principal.userId;
      await decideApproval(tx, context, { task, approverId, decision, comment, onBehalfOf });
    });
  }

  /**
   * Bloquea el trámite y la tarea, y revisa que la persona pueda verla: si no participa ni ve
   * todas las tareas, la tarea «no existe»; si ya se cerró, no admite más acciones.
   */
  private async run(
    { principal, ability, meta }: Request,
    id: string,
    action: (tx: TenantTransaction, context: WfContext, locked: LockedTask) => Promise<void>,
  ): Promise<void> {
    const context = contextOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await tx.workflowTask.findFirst({ where: { id, deletedAt: null } });
      const instance = found === null ? null : await lockInstance(tx, found.instanceId);
      const task = await tx.workflowTask.findFirst({ where: { id, deletedAt: null } });
      if (task === null || instance === null) throw taskNotFound();
      const actor = await taskActorOf(tx, principal, ability, context.at);
      const reason = taskReason(assignmentOf(task), actor);
      const readAll = hasUnconditionalPermission(ability, 'wf.task.read_all');
      const visible = reason !== null || readAll || actor.canReassign;
      if (!visible && !(await involvedUsers(tx, instance)).has(actor.userId)) throw taskNotFound();
      if (!isOpen(assignmentOf(task).status)) throw taskClosed();
      await action(tx, context, { task, actor, reason });
    });
  }

  /** Quien recibe la tarea, por identificador o por correo: un colaborador activo, no uno mismo. */
  private async receiverOf(
    tx: TenantTransaction,
    input: HandOverTaskRequest,
    self: string | null,
  ): Promise<string> {
    const byEmail =
      input.to_email === undefined ? null : await activeInternalUserByEmail(tx, input.to_email);
    const receiver = input.to_user_id ?? byEmail;
    const valid =
      receiver !== null && receiver !== self && (await isActiveInternalUser(tx, receiver));
    if (!valid) throw personInvalid();
    return receiver;
  }

  private async handedOver(
    tx: TenantTransaction,
    context: WfContext,
    task: WorkflowTask,
    change: {
      readonly action: string;
      readonly receiver: string;
      readonly comment: string | undefined;
    },
  ): Promise<void> {
    await this.audit(tx, context, change.action, task, {
      from_user_id: task.assigneeId,
      to_user_id: change.receiver,
      comment: change.comment ?? null,
    });
    await addOutboxEvent(tx, {
      tenantId: context.tenantId,
      eventType: 'wf.task.assigned',
      actorId: context.userId,
      occurredAt: context.at,
      payload: { task_id: task.id, instance_id: task.instanceId, assignee_id: change.receiver },
    });
  }

  private async audit(
    tx: TenantTransaction,
    context: WfContext,
    action: string,
    task: WorkflowTask,
    changes: Record<string, string | null>,
  ): Promise<void> {
    await auditWf(tx, context, {
      action,
      entityType: 'wf_task',
      entityId: task.id,
      changes: { instance_id: task.instanceId, ...changes },
    });
  }
}
