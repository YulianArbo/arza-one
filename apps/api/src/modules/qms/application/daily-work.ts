import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { emitQms, escalationRecipients } from './qms-support.js';

// Trabajo diario de Calidad (B38, decisión 11), a las 6:15 de Colombia: cada acción abierta cuya
// fecha compromiso ya pasó escala a su responsable, a Calidad y a la Dirección; el aviso se repite
// cada 7 días mientras siga sin ejecutarse.

interface DailyWorkDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface QmsDailyWorkResult {
  readonly escalatedActions: number;
}

const REPEAT_DAYS = 7;

async function dueTenants(database: DailyWorkDeps['database'], today: string): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT qms_tenants_with_overdue_actions(${today}::date)::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}

interface Scope {
  readonly tenantId: string;
  readonly today: string;
  readonly at: Date;
}

async function auditEscalation(
  tx: TenantTransaction,
  scope: Scope,
  action: { readonly id: string; readonly code: string },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'qms.action.escalate',
    entityType: 'qms_action',
    entityId: action.id,
    result: 'success',
    changes: { code: action.code, on: scope.today },
    meta: null,
  });
}

async function escalateTenant(deps: DailyWorkDeps, scope: Scope): Promise<number> {
  return deps.database.withTenant({ tenantId: scope.tenantId, userId: null }, async (tx) => {
    const lastAllowed = fromCalendarDate(addDays(scope.today, -REPEAT_DAYS));
    const overdue = await tx.qmsAction.findMany({
      where: {
        status: 'open',
        dueOn: { lt: fromCalendarDate(scope.today) },
        OR: [{ escalatedOn: null }, { escalatedOn: { lte: lastAllowed } }],
        deletedAt: null,
      },
    });
    const leaders = await escalationRecipients(tx, scope.at);
    const system = { tenantId: scope.tenantId, userId: null, at: scope.at };
    for (const action of overdue) {
      await tx.qmsAction.update({
        where: { id: action.id },
        data: { escalatedOn: fromCalendarDate(scope.today) },
      });
      await emitQms(tx, system, 'qms.action.overdue', {
        action_id: action.id,
        code: action.code,
        due_on: toCalendarDate(action.dueOn),
        recipients: [...new Set([action.responsibleId, ...leaders])],
      });
      await auditEscalation(tx, scope, action);
    }
    return overdue.length;
  });
}

/** Recorre las empresas con acciones vencidas; cada empresa en su propia transacción. */
export async function runQmsDailyWork(deps: DailyWorkDeps): Promise<QmsDailyWorkResult> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  let escalatedActions = 0;
  for (const tenantId of await dueTenants(deps.database, today)) {
    escalatedActions += await escalateTenant(deps, { tenantId, today, at });
  }
  return { escalatedActions };
}
