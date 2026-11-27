import { legalPeriodLabel, legalPeriodStart, periodEndOf } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, fromCalendarDate } from '../../core/index.js';
import { emitQms, escalationRecipients } from './qms-support.js';

// Aviso del normograma (B46, decisión 8): desde 30 días antes de que termine el semestre, si hay
// requisitos que aplican sin evaluación del semestre, Calidad y la Dirección reciben un aviso. Uno
// por empresa y semestre: cada requisito avisado guarda el semestre en `reminded_period`.

const NOTICE_DAYS = 30;

interface Scope {
  readonly tenantId: string;
  readonly today: string;
  readonly at: Date;
}

/** El primer día del semestre si ya empezó el aviso; si no, nada. */
function legalNoticePeriod(today: string): { start: string; endsOn: string } | null {
  const start = legalPeriodStart(today);
  const endsOn = addDays(periodEndOf('semiannual', start), -1);
  return today >= addDays(endsOn, -NOTICE_DAYS) ? { start, endsOn } : null;
}

async function pendingIds(tx: TenantTransaction, periodStart: Date): Promise<string[]> {
  const rows = await tx.qmsLegalRequirement.findMany({
    where: {
      applies: true,
      deletedAt: null,
      OR: [{ remindedPeriod: null }, { remindedPeriod: { not: periodStart } }],
      evaluations: { none: { periodStart, deletedAt: null } },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

async function auditReminder(tx: TenantTransaction, scope: Scope, count: number): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'qms.legal_requirement.remind',
    entityType: 'qms_legal_requirement',
    entityId: scope.tenantId,
    result: 'success',
    changes: { pending: count, on: scope.today },
    meta: null,
  });
}

/** Avisa una vez por semestre en la empresa; devuelve cuántos requisitos quedaron avisados. */
export async function remindLegalTenant(
  database: Pick<DatabaseService, 'withTenant'>,
  scope: Scope,
): Promise<number> {
  const period = legalNoticePeriod(scope.today);
  if (period === null) return 0;
  return database.withTenant({ tenantId: scope.tenantId, userId: null }, async (tx) => {
    const periodStart = fromCalendarDate(period.start);
    const ids = await pendingIds(tx, periodStart);
    if (ids.length === 0) return 0;
    await tx.qmsLegalRequirement.updateMany({
      where: { id: { in: ids } },
      data: { remindedPeriod: periodStart },
    });
    await emitQms(tx, { tenantId: scope.tenantId, userId: null, at: scope.at }, 'qms.legal.due', {
      count: ids.length,
      period: legalPeriodLabel(period.start),
      ends_on: period.endsOn,
      recipients: await escalationRecipients(tx, scope.at),
    });
    await auditReminder(tx, scope, ids.length);
    return ids.length;
  });
}

/** Las empresas con requisitos que aplican. */
export async function legalTenants(
  database: Pick<DatabaseService, 'withoutTenant'>,
): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT qms_tenants_with_legal_requirements()::text AS tenant_id
  `,
  );
  return rows.map((row) => row.tenant_id);
}
