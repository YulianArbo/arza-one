import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { OPEN_STATUSES } from '../domain/task-rules.js';
import { lockInstance } from './runtime.js';
import { auditWf, type WfContext } from './wf-context.js';

// Fecha límite de un trámite que cambia por una regla del módulo dueño (B42: la prórroga legal de
// una solicitud de titular o su plazo suspendido). Mueve el trámite y sus tareas abiertas; una
// tarea vencida que recibe más plazo vuelve a quedar pendiente. Sin fecha, no vence mientras tanto.

/** Cambia la fecha límite del trámite abierto; dice si lo encontró. */
export async function rescheduleWorkflow(
  tx: TenantTransaction,
  context: WfContext,
  target: { readonly instanceId: string; readonly dueAt: Date | null },
): Promise<boolean> {
  const instance = await lockInstance(tx, target.instanceId);
  if (instance === null) return false;
  if (instance.completedAt !== null) return false;
  await tx.workflowInstance.update({ where: { id: instance.id }, data: { dueAt: target.dueAt } });
  const open = { instanceId: instance.id, status: { in: [...OPEN_STATUSES] }, deletedAt: null };
  await tx.workflowTask.updateMany({ where: open, data: { dueAt: target.dueAt } });
  const later = target.dueAt === null || target.dueAt > context.at;
  if (later) {
    await tx.workflowTask.updateMany({
      where: { ...open, status: 'overdue' },
      data: { status: 'pending' },
    });
  }
  await auditWf(tx, context, {
    action: 'wf.instance.reschedule',
    entityType: 'wf_instance',
    entityId: instance.id,
    changes: {
      due_at: [instance.dueAt?.toISOString() ?? null, target.dueAt?.toISOString() ?? null],
    },
  });
  return true;
}
