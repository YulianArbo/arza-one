import { Inject, Injectable } from '@nestjs/common';
import type { InstanceActionRequest, InstanceView } from '@arza/contracts';

import type { WorkflowInstance } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import type { TaskActor } from '../domain/task-rules.js';
import { findFlow, type StoredFlow } from '../infrastructure/flow-store.js';
import { lockInstance, openTasksOf } from './runtime.js';
import { actionsFor, attendsState, instanceAccess, permissionCheck } from './wf-access.js';
import { contextOf, taskActorOf } from './wf-context.js';
import { instanceNotFound } from './wf-messages.js';
import {
  loadHistory,
  peopleOf,
  stateRef,
  taskPeopleIds,
  taskSummary,
  TASK_CONTEXT,
} from './wf-views.js';
import { requestTransition } from './workflow-engine.js';

// Trámites (ficha 17.5): su estado, las acciones que la persona puede pedir y el historial con
// actor, fecha, decisión y comentario de cada paso. Es lo que muestran los componentes de
// «Acciones del trámite» e «Historial del flujo».

@Injectable()
export class InstancesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(principal: Principal, ability: AppAbility, id: string): Promise<InstanceView> {
    return this.database.withTenant(principal, async (tx) => {
      const instance = await tx.workflowInstance.findFirst({ where: { id, deletedAt: null } });
      const actor = await taskActorOf(tx, principal, ability, this.clock.now());
      if (instance === null) throw instanceNotFound();
      const access = await instanceAccess(tx, instance, actor, ability);
      const flow = await findFlow(tx, instance.definitionId);
      if (!access.visible || flow === null) throw instanceNotFound();
      const hasPermission = permissionCheck(ability, access.involved);
      return this.view(tx, { instance, flow, actor, hasPermission });
    });
  }

  /** Pide una transición del flujo; la API rechaza la que no está definida (ficha 17.5). */
  async act(
    request: {
      readonly principal: Principal;
      readonly ability: AppAbility;
      readonly meta: RequestMeta;
    },
    id: string,
    action: string,
    input: InstanceActionRequest,
  ): Promise<void> {
    const { principal, ability } = request;
    const context = contextOf(principal, request.meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const instance = await lockInstance(tx, id);
      if (instance === null) throw instanceNotFound();
      const actor = await taskActorOf(tx, principal, ability, context.at);
      const access = await instanceAccess(tx, instance, actor, ability);
      if (!access.visible) throw instanceNotFound();
      await requestTransition(tx, context, {
        instanceId: id,
        action,
        comment: input.comment ?? null,
        facts: {},
        actor,
        hasPermission: permissionCheck(ability, access.involved),
      });
    });
  }

  private async view(
    tx: TenantTransaction,
    seen: {
      readonly instance: WorkflowInstance;
      readonly flow: StoredFlow;
      readonly actor: TaskActor;
      readonly hasPermission: Parameters<typeof actionsFor>[2]['hasPermission'];
    },
  ): Promise<InstanceView> {
    const { instance, flow } = seen;
    const tasks = await tx.workflowTask.findMany({
      where: { instanceId: instance.id, deletedAt: null },
      include: TASK_CONTEXT,
      orderBy: { createdAt: 'asc' },
    });
    const people = await peopleOf(tx, [instance.startedBy, ...taskPeopleIds(tasks)]);
    const open = await openTasksOf(tx, instance.id);
    const attends = attendsState(instance, open, seen.actor);
    return {
      id: instance.id,
      title: instance.title,
      entity_type: instance.entityType,
      entity_id: instance.entityId,
      workflow: { id: flow.id, key: flow.key, name: flow.name, version: flow.versionNumber },
      state: stateRef(flow.states, instance.currentState),
      started_by: instance.startedBy === null ? null : (people.get(instance.startedBy) ?? null),
      started_at: instance.startedAt.toISOString(),
      due_at: instance.dueAt?.toISOString() ?? null,
      completed_at: instance.completedAt?.toISOString() ?? null,
      row_version: instance.version,
      actions: actionsFor(flow, instance, {
        attendsState: attends,
        hasPermission: seen.hasPermission,
      }),
      tasks: tasks.map((task) => taskSummary(task, people, null)),
      history: await loadHistory(tx, flow, instance.id),
    };
  }
}
