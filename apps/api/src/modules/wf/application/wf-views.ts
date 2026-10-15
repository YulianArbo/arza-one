import {
  stateKindSchema,
  taskPrioritySchema,
  taskStatusSchema,
  type HistoryEntry,
  type StateInput,
  type TaskReason,
  type TaskSummary,
} from '@arza/contracts';

import type {
  Prisma,
  WorkflowApproval,
  WorkflowHistory,
  WorkflowTask,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';
import type { Flow } from '../domain/engine.js';

// Vistas de las tareas, los trámites y su historial para la API (contratos de @arza/contracts).

const LIVE_STATES = { states: { where: { deletedAt: null } } } as const;

/** Lo que una tarea necesita para mostrarse: su trámite, el flujo y sus estados. */
export const TASK_CONTEXT = {
  instance: { include: { definition: { include: LIVE_STATES } } },
} as const satisfies Prisma.WorkflowTaskInclude;

export type TaskWithContext = Prisma.WorkflowTaskGetPayload<{ include: typeof TASK_CONTEXT }>;

type Person = NonNullable<TaskSummary['assignee']>;
export type People = ReadonlyMap<string, Person>;

/** Nombre y correo de las personas, para mostrarlas. */
export async function peopleOf(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<People> {
  const found = await peopleById(
    tx,
    ids.filter((id): id is string => id !== null),
  );
  return new Map(
    [...found.values()].map((user) => [
      user.id,
      { id: user.id, email: user.email, display_name: user.displayName },
    ]),
  );
}

function personIn(people: People, id: string | null): Person | null {
  return id === null ? null : (people.get(id) ?? null);
}

export function stateRef(states: readonly StateInput[], key: string): HistoryEntry['to_state'] {
  const state = states.find((candidate) => candidate.key === key);
  return { key, label: state?.label ?? key, kind: state?.kind ?? 'normal' };
}

/** Personas que aparecen en las tareas. */
export function taskPeopleIds(tasks: readonly WorkflowTask[]): (string | null)[] {
  return tasks.flatMap((task) => [task.assigneeId, task.escalatedToId, task.delegatedFromId]);
}

export function taskSummary(
  task: TaskWithContext,
  people: People,
  reason: TaskReason | null,
): TaskSummary {
  const { instance } = task;
  const current = instance.definition.states.find((row) => row.key === instance.currentState);
  const state = {
    key: instance.currentState,
    label: current?.label ?? instance.currentState,
    kind: stateKindSchema.parse(current?.kind ?? 'normal'),
  };
  return {
    id: task.id,
    title: task.title,
    kind: task.kind === 'approval' ? 'approval' : 'action',
    status: taskStatusSchema.parse(task.status),
    priority: taskPrioritySchema.parse(task.priority),
    due_at: task.dueAt?.toISOString() ?? null,
    assignee: personIn(people, task.assigneeId),
    assignee_role: task.assigneeId === null ? task.assigneeRole : null,
    escalated_to: personIn(people, task.escalatedToId),
    escalated_at: task.escalatedAt?.toISOString() ?? null,
    delegated_from: personIn(people, task.delegatedFromId),
    instance: {
      id: instance.id,
      title: instance.title,
      workflow_name: instance.definition.name,
      state,
    },
    reason,
    created_at: task.createdAt.toISOString(),
    completed_at: task.completedAt?.toISOString() ?? null,
  };
}

const DECISION_LABELS = { approved: 'Aprobó', rejected: 'Rechazó' } as const;

type ApprovalWithTask = WorkflowApproval & { task: Pick<WorkflowTask, 'stateKey'> };

function actionLabel(flow: Flow, row: WorkflowHistory): string {
  if (row.action === 'start') return 'Inició el trámite';
  const transition = flow.transitions.find(
    (t) => t.from_state === row.fromState && t.action === row.action,
  );
  return transition?.label ?? row.action;
}

/** Historial del trámite: cada paso y cada decisión, del más antiguo al más reciente. */
export function historyEntries(
  flow: Flow,
  rows: {
    readonly steps: readonly WorkflowHistory[];
    readonly decisions: readonly ApprovalWithTask[];
  },
  people: People,
): HistoryEntry[] {
  const steps = rows.steps.map((row) => ({
    id: row.id,
    from_state: row.fromState === null ? null : stateRef(flow.states, row.fromState),
    to_state: stateRef(flow.states, row.toState),
    action: row.action,
    action_label: actionLabel(flow, row),
    actor: personIn(people, row.actorId),
    on_behalf_of: personIn(people, row.onBehalfOf),
    comment: row.comment,
    occurred_at: row.occurredAt,
  }));
  const decisions = rows.decisions.map((row) => ({
    id: row.id,
    from_state: stateRef(flow.states, row.task.stateKey),
    to_state: stateRef(flow.states, row.task.stateKey),
    action: row.decision === 'rejected' ? 'reject' : 'approve',
    action_label: row.decision === 'rejected' ? DECISION_LABELS.rejected : DECISION_LABELS.approved,
    actor: personIn(people, row.approverId),
    on_behalf_of: personIn(people, row.onBehalfOf),
    comment: row.comment,
    occurred_at: row.decidedAt,
  }));
  return [...steps, ...decisions]
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime() || a.id.localeCompare(b.id))
    .map((entry) => ({ ...entry, occurred_at: entry.occurred_at.toISOString() }));
}

/** Historial y decisiones del trámite, con las personas que actuaron. */
export async function loadHistory(
  tx: TenantTransaction,
  flow: Flow,
  instanceId: string,
): Promise<HistoryEntry[]> {
  const [steps, decisions] = await Promise.all([
    tx.workflowHistory.findMany({ where: { instanceId }, orderBy: { occurredAt: 'asc' } }),
    tx.workflowApproval.findMany({
      where: { task: { instanceId } },
      include: { task: { select: { stateKey: true } } },
    }),
  ]);
  const ids = [
    ...steps.flatMap((row) => [row.actorId, row.onBehalfOf]),
    ...decisions.flatMap((row) => [row.approverId, row.onBehalfOf]),
  ];
  return historyEntries(flow, { steps, decisions }, await peopleOf(tx, ids));
}
