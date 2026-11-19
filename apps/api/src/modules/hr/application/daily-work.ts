import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { applyTermination } from './offboarding-termination.js';

// Trabajo diario de Talento humano (B36), a las 0:05 de Colombia: las ausencias aprobadas cuyo
// último día ya pasó quedan «disfrutadas» (ficha 17.13) y los retiros cuyo último día laborado
// terminó desactivan la cuenta y cierran las sesiones (numeral 15.1, decisión 9).

interface DailyWorkDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface DailyWorkResult {
  readonly leavesTaken: number;
  readonly accountsClosed: number;
}

async function dueTenants(
  database: DailyWorkDeps['database'],
  today: string,
): Promise<readonly string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT hr_tenants_with_daily_work(${today}::date)::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}

async function markTaken(
  tx: TenantTransaction,
  scope: { readonly tenantId: string; readonly today: string; readonly at: Date },
): Promise<number> {
  const due = await tx.hrLeaveRequest.findMany({
    where: { status: 'approved', endsOn: { lt: fromCalendarDate(scope.today) }, deletedAt: null },
    select: { id: true },
  });
  for (const { id } of due) {
    await tx.hrLeaveRequest.update({ where: { id }, data: { status: 'taken' } });
    await recordAuditEvent(tx, {
      tenantId: scope.tenantId,
      occurredAt: scope.at,
      actor: { kind: 'system' },
      action: 'hr.leave.taken',
      entityType: 'hr_leave_request',
      entityId: id,
      result: 'success',
      changes: { status: { from: 'approved', to: 'taken' } },
      meta: null,
    });
  }
  return due.length;
}

async function closeAccounts(
  tx: TenantTransaction,
  scope: { readonly tenantId: string; readonly today: string; readonly at: Date },
): Promise<number> {
  const due = await tx.hrOffboarding.findMany({
    where: {
      status: 'in_progress',
      accountDeactivatedAt: null,
      lastDay: { lt: fromCalendarDate(scope.today) },
      deletedAt: null,
    },
    include: { employee: true },
  });
  for (const offboarding of due) {
    const actor = { tenantId: scope.tenantId, userId: null, at: scope.at, meta: null };
    await applyTermination(tx, actor, offboarding, offboarding.employee);
  }
  return due.length;
}

/** Recorre las empresas con trabajo pendiente; cada empresa en su propia transacción. */
export async function runHrDailyWork(deps: DailyWorkDeps): Promise<DailyWorkResult> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  let leavesTaken = 0;
  let accountsClosed = 0;
  for (const tenantId of await dueTenants(deps.database, today)) {
    const scope = { tenantId, today, at };
    await deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
      leavesTaken += await markTaken(tx, scope);
      accountsClosed += await closeAccounts(tx, scope);
    });
  }
  return { leavesTaken, accountsClosed };
}
