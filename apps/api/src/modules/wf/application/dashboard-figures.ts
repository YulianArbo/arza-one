import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';

// Tareas vencidas para el tablero de cumplimiento (B46, decisión 10): las que el motor marcó
// «Vencida» al pasar su fecha límite. Es el mismo filtro del tablero de tareas.

export interface OverdueTaskRow {
  readonly id: string;
  readonly title: string;
  readonly assignee: string;
  readonly dueAt: string | null;
}

export async function overdueTasks(tx: TenantTransaction): Promise<OverdueTaskRow[]> {
  const rows = await tx.workflowTask.findMany({
    where: { status: 'overdue', deletedAt: null },
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, assigneeId: true, assigneeRole: true, dueAt: true },
  });
  const ids = rows.flatMap((row) => (row.assigneeId === null ? [] : [row.assigneeId]));
  const people = await peopleById(tx, [...new Set(ids)]);
  return rows.map((row) => {
    const person = row.assigneeId === null ? undefined : people.get(row.assigneeId);
    return {
      id: row.id,
      title: row.title,
      assignee: person?.displayName ?? person?.email ?? row.assigneeRole ?? 'Sin asignar',
      dueAt: row.dueAt?.toISOString() ?? null,
    };
  });
}
