import { Inject, Injectable } from '@nestjs/common';
import {
  taskPrioritySchema,
  taskStatusSchema,
  type MyTasksQuery,
  type TaskBoardQuery,
  type TaskListResponse,
  type TaskView,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  inboxOrder,
  OPEN_STATUSES,
  taskReason,
  type InboxEntry,
  type TaskActor,
} from '../domain/task-rules.js';
import { findFlow } from '../infrastructure/flow-store.js';
import { actionsFor, involvedUsers, permissionCheck } from './wf-access.js';
import { taskActorOf } from './wf-context.js';
import { taskNotFound } from './wf-messages.js';
import {
  loadHistory,
  peopleOf,
  taskPeopleIds,
  taskSummary,
  TASK_CONTEXT,
  type TaskWithContext,
} from './wf-views.js';
import { assignmentOf } from './workflow-engine.js';

// Bandeja «Mis tareas» y tablero de tareas (ficha 17.5): una sola bandeja para todos los módulos,
// con vencimientos y prioridad. La API decide qué tareas ve cada persona.

/** Cuántas tareas muestra la bandeja: las 100 más urgentes, o las 100 cerradas más recientes. */
const INBOX_LIMIT = 100;

/** Dónde puede estar una tarea que la persona atiende: suya, de su rol, delegada o escalada. */
function inboxWhere(actor: TaskActor): Prisma.WorkflowTaskWhereInput[] {
  const delegated = [...actor.delegations].map(([fromUserId, permissions]) => ({
    assigneeId: fromUserId,
    kind: 'approval',
    requiredPermission: { in: [...permissions] },
  }));
  const ownerless = actor.canReassign
    ? [
        { assigneeId: null, assigneeRole: null },
        { escalatedAt: { not: null }, escalatedToId: null },
      ]
    : [];
  return [
    { assigneeId: actor.userId },
    { escalatedToId: actor.userId },
    { assigneeId: null, assigneeRole: { in: [...actor.roleCodes] } },
    ...delegated,
    ...ownerless,
  ];
}

function inboxEntryOf(task: TaskWithContext): InboxEntry {
  return {
    status: taskStatusSchema.parse(task.status),
    priority: taskPrioritySchema.parse(task.priority),
    dueAt: task.dueAt,
  };
}

async function summaries(
  tx: TenantTransaction,
  tasks: readonly TaskWithContext[],
  actor: TaskActor | null,
): Promise<TaskListResponse['data']> {
  const people = await peopleOf(tx, taskPeopleIds(tasks));
  return tasks.map((task) =>
    taskSummary(task, people, actor === null ? null : taskReason(assignmentOf(task), actor)),
  );
}

@Injectable()
export class TaskQueriesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async mine(
    principal: Principal,
    ability: AppAbility,
    query: MyTasksQuery,
  ): Promise<TaskListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const actor = await taskActorOf(tx, principal, ability, this.clock.now());
      if (query.view === 'closed') return { data: await this.closed(tx, actor), next_cursor: null };
      const statuses = query.view === 'overdue' ? ['overdue'] : [...OPEN_STATUSES];
      const candidates = await tx.workflowTask.findMany({
        where: { deletedAt: null, status: { in: statuses }, OR: inboxWhere(actor) },
        include: TASK_CONTEXT,
        orderBy: { dueAt: 'asc' },
        take: INBOX_LIMIT * 2,
      });
      const mine = candidates.filter((task) => taskReason(assignmentOf(task), actor) !== null);
      const sorted = [...mine]
        .sort((a, b) => inboxOrder(inboxEntryOf(a), inboxEntryOf(b)))
        .slice(0, INBOX_LIMIT);
      return { data: await summaries(tx, sorted, actor), next_cursor: null };
    });
  }

  /** Tablero de quien ve todas las tareas: por estado o solo las escaladas, por páginas. */
  async board(principal: Principal, query: TaskBoardQuery): Promise<TaskListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.workflowTask.findMany({
        where: {
          deletedAt: null,
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.escalated === 'true' ? { escalatedAt: { not: null } } : {}),
        },
        include: TASK_CONTEXT,
        orderBy: { id: 'desc' },
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const next = rows.length > query.limit && last !== undefined ? last.id : null;
      return { data: await summaries(tx, page, null), next_cursor: next };
    });
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<TaskView> {
    return this.database.withTenant(principal, async (tx) => {
      const actor = await taskActorOf(tx, principal, ability, this.clock.now());
      const task = await tx.workflowTask.findFirst({
        where: { id, deletedAt: null },
        include: TASK_CONTEXT,
      });
      if (task === null) throw taskNotFound();
      const involved = await involvedUsers(tx, task.instance);
      const reason = taskReason(assignmentOf(task), actor);
      const readAll = hasUnconditionalPermission(ability, 'wf.task.read_all');
      if (reason === null && !involved.has(actor.userId) && !readAll) throw taskNotFound();
      return this.detail(tx, task, { reason, hasPermission: permissionCheck(ability, involved) });
    });
  }

  private async detail(
    tx: TenantTransaction,
    task: TaskWithContext,
    access: {
      reason: ReturnType<typeof taskReason>;
      hasPermission: Parameters<typeof actionsFor>[2]['hasPermission'];
    },
  ): Promise<TaskView> {
    const flow = await findFlow(tx, task.instance.definitionId);
    if (flow === null) throw taskNotFound();
    const [summary] = await summaries(tx, [task], null);
    if (summary === undefined) throw taskNotFound();
    const canAct = access.reason !== null;
    const actions =
      canAct && task.kind === 'action'
        ? actionsFor(flow, task.instance, {
            attendsState: true,
            hasPermission: access.hasPermission,
          })
        : [];
    const history = await loadHistory(tx, flow, task.instanceId);
    return { ...summary, reason: access.reason, can_act: canAct, actions, history };
  }

  private async closed(tx: TenantTransaction, actor: TaskActor) {
    const tasks = await tx.workflowTask.findMany({
      where: {
        deletedAt: null,
        status: { in: ['completed', 'cancelled'] },
        OR: [{ assigneeId: actor.userId }, { completedBy: actor.userId }],
      },
      include: TASK_CONTEXT,
      orderBy: { completedAt: 'desc' },
      take: INBOX_LIMIT,
    });
    return summaries(tx, tasks, null);
  }
}
