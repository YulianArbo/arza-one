import type { Prisma } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { auditWf, supervisorOf, type WfContext } from './wf-context.js';

// Escalamiento por vencimiento (ficha 17.5): una tarea vencida queda «vencida» y escala al jefe
// inmediato de su responsable, que la ve en su bandeja; queda visible en el tablero. Si no hay jefe
// a quien escalar, la atiende quien reasigna tareas. Lo ejecuta el worker cada 15 minutos.

export interface OverdueCheckDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

/** Cuántas tareas revisa por empresa en cada pasada; las demás quedan para la siguiente. */
const BATCH = 500;

function dueAndOpen(now: Date): Prisma.WorkflowTaskWhereInput {
  return { status: { in: ['pending', 'in_progress'] }, dueAt: { lt: now }, deletedAt: null };
}

async function escalateTask(tx: TenantTransaction, context: WfContext, id: string) {
  const task = await tx.workflowTask.findFirst({ where: { id, ...dueAndOpen(context.at) } });
  if (task === null) return false;
  const boss = await supervisorOf(tx, task.assigneeId);
  const escalatedToId = boss === task.assigneeId ? null : boss;
  await tx.workflowTask.update({
    where: { id },
    data: { status: 'overdue', escalatedAt: context.at, escalatedToId },
  });
  await auditWf(tx, context, {
    action: 'wf.task.escalate',
    entityType: 'wf_task',
    entityId: id,
    changes: { instance_id: task.instanceId, escalated_to_id: escalatedToId },
  });
  await addOutboxEvent(tx, {
    tenantId: context.tenantId,
    eventType: 'wf.task.escalated',
    actorId: null,
    occurredAt: context.at,
    payload: { task_id: id, instance_id: task.instanceId, escalated_to_id: escalatedToId },
  });
  return true;
}

async function escalateTenant(deps: OverdueCheckDependencies, tenantId: string, now: Date) {
  const system = { tenantId, userId: null };
  const due = await deps.database.withTenant(system, (tx) =>
    tx.workflowTask.findMany({ where: dueAndOpen(now), select: { id: true }, take: BATCH }),
  );
  const context: WfContext = { ...system, meta: null, at: now };
  let escalated = 0;
  // Una transacción corta por tarea: una falla no deshace las demás y el trabajo es idempotente.
  for (const { id } of due) {
    const done = await deps.database.withTenant(system, (tx) => escalateTask(tx, context, id));
    if (done) escalated += 1;
  }
  return escalated;
}

/** Revisa las tareas vencidas de todas las empresas. Devuelve cuántas escaló. */
export async function escalateOverdueTasks(deps: OverdueCheckDependencies): Promise<number> {
  const now = deps.clock.now();
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT wf_tenants_with_overdue_tasks(${now}) AS id`,
  );
  let escalated = 0;
  for (const { id } of tenants) escalated += await escalateTenant(deps, id, now);
  return escalated;
}
