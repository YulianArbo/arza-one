import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { emitSst, sstLeaders } from './sst-support.js';

// Trabajo diario de SST (B37), a las 6:00 de Colombia: recuerda a SST cada accidente que aún no se
// reporta a la ARL (decisión 5, cada día hasta que se registre), avisa una vez de las evaluaciones
// médicas que vencen en 30 días o menos y una vez al responsable de cada actividad vencida del plan.

interface DailyWorkDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface SstDailyWorkResult {
  readonly arlReminders: number;
  readonly examNotices: number;
  readonly overdueActivities: number;
}

interface Scope {
  readonly tenantId: string;
  readonly today: string;
  readonly at: Date;
}

const DUE_SOON_DAYS = 30;

async function dueTenants(database: DailyWorkDeps['database'], today: string): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT sst_tenants_with_daily_work(${today}::date)::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}

async function auditAlert(
  tx: TenantTransaction,
  scope: Scope,
  entity: string,
  id: string,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'sst.alert.sent',
    entityType: entity,
    entityId: id,
    result: 'success',
    changes: { on: scope.today },
    meta: null,
  });
}

async function remindArl(tx: TenantTransaction, scope: Scope): Promise<number> {
  const due = await tx.sstIncident.findMany({
    where: { kind: 'accident', arlReportedOn: null, status: { not: 'closed' }, deletedAt: null },
  });
  if (due.length === 0) return 0;
  const recipients = await sstLeaders(tx, scope.at);
  const system = { tenantId: scope.tenantId, userId: null, at: scope.at };
  for (const incident of due) {
    await emitSst(tx, system, 'sst.arl.due', {
      incident_id: incident.id,
      code: incident.code,
      due_on: toCalendarDate(incident.arlDueOn ?? incident.occurredAt),
      recipients,
    });
  }
  return due.length;
}

async function noticeExams(tx: TenantTransaction, scope: Scope): Promise<number> {
  const limit = fromCalendarDate(addDays(scope.today, DUE_SOON_DAYS));
  const exams = await tx.sstMedicalExam.findMany({
    where: { nextDueOn: { not: null, lte: limit }, deletedAt: null },
  });
  const pending = exams.filter((exam) => {
    if (exam.nextDueOn === null) return false;
    const window = addDays(toCalendarDate(exam.nextDueOn), -DUE_SOON_DAYS);
    return exam.dueNoticeOn === null || toCalendarDate(exam.dueNoticeOn) < window;
  });
  if (pending.length === 0) return 0;
  const recipients = await sstLeaders(tx, scope.at);
  const system = { tenantId: scope.tenantId, userId: null, at: scope.at };
  for (const exam of pending) {
    await tx.sstMedicalExam.update({
      where: { id: exam.id },
      data: { dueNoticeOn: fromCalendarDate(scope.today) },
    });
    await emitSst(tx, system, 'sst.exam.due', {
      exam_id: exam.id,
      due_on: toCalendarDate(exam.nextDueOn ?? exam.examDate),
      recipients,
    });
    await auditAlert(tx, scope, 'sst_medical_exam', exam.id);
  }
  return pending.length;
}

async function noticeOverduePlan(tx: TenantTransaction, scope: Scope): Promise<number> {
  const items = await tx.sstWorkPlanItem.findMany({
    where: {
      doneOn: null,
      overdueNoticeOn: null,
      dueOn: { lt: fromCalendarDate(scope.today) },
      deletedAt: null,
    },
  });
  const system = { tenantId: scope.tenantId, userId: null, at: scope.at };
  for (const item of items) {
    await tx.sstWorkPlanItem.update({
      where: { id: item.id },
      data: { overdueNoticeOn: fromCalendarDate(scope.today) },
    });
    await emitSst(tx, system, 'sst.task.assigned', {
      item_id: item.id,
      task: `Actividad vencida del plan de SST: ${item.activity}`,
      due_on: toCalendarDate(item.dueOn),
      recipients: [item.responsibleId],
      link: '/app/talento-y-sst/sst/plan',
    });
    await auditAlert(tx, scope, 'sst_work_plan_item', item.id);
  }
  return items.length;
}

/** Recorre las empresas con alertas pendientes; cada empresa en su propia transacción. */
export async function runSstDailyWork(deps: DailyWorkDeps): Promise<SstDailyWorkResult> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  const totals = { arlReminders: 0, examNotices: 0, overdueActivities: 0 };
  for (const tenantId of await dueTenants(deps.database, today)) {
    const scope = { tenantId, today, at };
    await deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
      totals.arlReminders += await remindArl(tx, scope);
      totals.examNotices += await noticeExams(tx, scope);
      totals.overdueActivities += await noticeOverduePlan(tx, scope);
    });
  }
  return totals;
}
