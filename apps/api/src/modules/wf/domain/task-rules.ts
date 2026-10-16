import type { PermissionCode, TaskPriority, TaskReason, TaskStatus } from '@arza/contracts';

// Reglas de las tareas (ficha 17.5): pendiente → en curso → completada, vencida o cancelada. Una
// tarea vencida sigue abierta: su responsable o el jefe inmediato aún pueden atenderla.

export const OPEN_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'overdue'];

export function isOpen(status: TaskStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Lo que importa de una tarea para saber quién la atiende. */
export interface TaskAssignment {
  readonly kind: 'action' | 'approval';
  readonly status: TaskStatus;
  readonly assigneeId: string | null;
  readonly assigneeRole: string | null;
  readonly requiredPermission: PermissionCode | null;
  readonly escalatedToId: string | null;
  readonly escalatedAt: Date | null;
}

/** Quien pide atender una tarea. */
export interface TaskActor {
  readonly userId: string;
  readonly roleCodes: ReadonlySet<string>;
  /** Aprobaciones delegadas a la persona (B10): de quién y qué permisos. */
  readonly delegations: ReadonlyMap<string, ReadonlySet<PermissionCode>>;
  /** Puede reasignar tareas: atiende las que no tienen responsable. */
  readonly canReassign: boolean;
}

/** La tarea no tiene a quién llegar: sin persona ni rol, o vencida sin jefe a quien escalar. */
export function needsOwner(task: TaskAssignment): boolean {
  const nobody = task.assigneeId === null && task.assigneeRole === null;
  const escalatedToNobody = task.escalatedAt !== null && task.escalatedToId === null;
  return nobody || escalatedToNobody;
}

function delegated(task: TaskAssignment, actor: TaskActor): boolean {
  if (task.kind !== 'approval' || task.assigneeId === null || task.requiredPermission === null) {
    return false;
  }
  return actor.delegations.get(task.assigneeId)?.has(task.requiredPermission) ?? false;
}

/** Por qué la persona puede atender la tarea, o null si no puede. */
export function taskReason(task: TaskAssignment, actor: TaskActor): TaskReason | null {
  if (!isOpen(task.status)) return null;
  if (task.assigneeId === actor.userId) return 'assigned';
  if (task.escalatedToId === actor.userId) return 'escalation';
  if (task.assigneeId === null && task.assigneeRole !== null) {
    if (actor.roleCodes.has(task.assigneeRole)) return 'role';
  }
  if (delegated(task, actor)) return 'delegation';
  if (needsOwner(task) && actor.canReassign) return 'unassigned';
  return null;
}

/** Solo su responsable (o quien la tiene por su rol) la entrega a otra persona. */
export function canHandOver(reason: TaskReason | null): boolean {
  return reason === 'assigned' || reason === 'role';
}

const PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface InboxEntry {
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueAt: Date | null;
}

/** Orden de «Mis tareas»: primero las vencidas, luego por vencimiento y por prioridad. */
export function inboxOrder(a: InboxEntry, b: InboxEntry): number {
  const overdue = Number(b.status === 'overdue') - Number(a.status === 'overdue');
  if (overdue !== 0) return overdue;
  const dueA = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const dueB = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}
