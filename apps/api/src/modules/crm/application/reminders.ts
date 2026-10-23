import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { isStaleReminder, reminderHorizon } from '../domain/crm-rules.js';
import { recordCrmChange, type CrmActor } from './crm-support.js';

// Recordatorios de las actividades (B22, ficha 17.6): cada minuto el worker avisa al responsable de
// cada actividad pendiente que empieza en los próximos 30 minutos. El aviso lo escribe el módulo de
// avisos con el evento «crm.activity.reminder»; cada actividad se avisa una sola vez por hora
// programada. Una actividad que ya pasó hace más de un día se marca sin avisar.

export interface ReminderDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

/** Cuántas actividades revisa por empresa en cada pasada; las demás quedan para la siguiente. */
const BATCH = 500;

function dueWhere(now: Date) {
  return {
    doneAt: null,
    remindedAt: null,
    assigneeId: { not: null },
    dueAt: { lte: reminderHorizon(now) },
    deletedAt: null,
  };
}

async function remindActivity(tx: TenantTransaction, actor: CrmActor, id: string) {
  const activity = await tx.crmActivity.findFirst({
    where: { id, ...dueWhere(actor.at) },
    include: { lead: { select: { code: true } }, opportunity: { select: { code: true } } },
  });
  if (activity === null) return false;
  await tx.crmActivity.update({ where: { id }, data: { remindedAt: actor.at } });
  const stale = isStaleReminder(activity.dueAt, actor.at);
  await recordCrmChange(tx, actor, {
    action: 'crm.activity.remind',
    event: stale ? 'crm.activity.missed' : 'crm.activity.reminder',
    entityType: 'crm_activity',
    entityId: id,
    changes: { due_at: activity.dueAt.toISOString(), skipped: stale },
    payload: {
      assignee_id: activity.assigneeId,
      subject: activity.subject,
      record_code: activity.lead?.code ?? activity.opportunity?.code ?? '',
      due_at: activity.dueAt.toISOString(),
    },
  });
  return !stale;
}

async function remindTenant(deps: ReminderDependencies, tenantId: string, now: Date) {
  const system = { tenantId, userId: null };
  const due = await deps.database.withTenant(system, (tx) =>
    tx.crmActivity.findMany({ where: dueWhere(now), select: { id: true }, take: BATCH }),
  );
  const actor: CrmActor = { ...system, meta: null, at: now };
  let sent = 0;
  // Una transacción corta por actividad: una falla no deshace las demás y el trabajo es idempotente.
  for (const { id } of due) {
    if (await deps.database.withTenant(system, (tx) => remindActivity(tx, actor, id))) sent += 1;
  }
  return sent;
}

/** Revisa las actividades de todas las empresas. Devuelve cuántos recordatorios envió. */
export async function sendActivityReminders(deps: ReminderDependencies): Promise<number> {
  const now = deps.clock.now();
  const until = reminderHorizon(now);
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT crm_tenants_with_due_reminders(${until}) AS id`,
  );
  let sent = 0;
  for (const { id } of tenants) sent += await remindTenant(deps, id, now);
  return sent;
}
