import {
  indicatorFrequencySchema,
  indicatorSourceSchema,
  isAutomaticSource,
  periodLabel,
  periodStartOf,
  previousPeriodStart,
} from '@arza/contracts';

import type { QmsIndicator } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, fromCalendarDate } from '../../core/index.js';
import { storeAutomatic } from './measurement-records.js';
import { emitQms } from './qms-support.js';

// Trabajo diario de los indicadores (B39, decisión 7), a las 6:30 de Colombia. Al cerrar cada
// periodo, la plataforma calcula los automáticos (si aún no tienen su medición; si no hay datos,
// lo intenta de nuevo al día siguiente). Desde el día 5 del periodo nuevo, el responsable de cada
// indicador manual sin medición recibe un aviso, una sola vez por periodo.

interface IndicatorWorkDeps {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface IndicatorWorkResult {
  readonly calculated: number;
  readonly reminded: number;
}

/** Días después de cerrar el periodo en que se avisa: el aviso sale el día 5. */
const REMIND_AFTER_DAYS = 4;

interface Scope {
  readonly tx: TenantTransaction;
  readonly tenantId: string;
  readonly at: Date;
  readonly today: string;
}

async function systemAudit(scope: Scope, indicator: QmsIndicator, changes: object) {
  await recordAuditEvent(scope.tx, {
    tenantId: scope.tenantId,
    occurredAt: scope.at,
    actor: { kind: 'system' },
    action: 'qms.indicator.calculate',
    entityType: 'qms_indicator',
    entityId: indicator.id,
    result: 'success',
    changes: { code: indicator.code, ...changes },
    meta: null,
  });
}

async function measured(scope: Scope, indicatorId: string, period: string): Promise<boolean> {
  const row = await scope.tx.qmsMeasurement.findFirst({
    where: { indicatorId, periodStart: fromCalendarDate(period), deletedAt: null },
    select: { id: true },
  });
  return row !== null;
}

async function calculate(scope: Scope, indicator: QmsIndicator, period: string): Promise<boolean> {
  const outcome = await storeAutomatic(scope.tx, indicator, period);
  if (outcome.kind === 'no_data') return false;
  await systemAudit(scope, indicator, { period_start: period, value: outcome.value });
  return true;
}

async function remind(scope: Scope, indicator: QmsIndicator, period: string): Promise<boolean> {
  const frequency = indicatorFrequencySchema.parse(indicator.frequency);
  const remindFrom = addDays(periodStartOf(frequency, scope.today), REMIND_AFTER_DAYS);
  const already = indicator.remindedPeriod?.toISOString().slice(0, 10) === period;
  if (scope.today < remindFrom || already) return false;
  await scope.tx.qmsIndicator.update({
    where: { id: indicator.id },
    data: { remindedPeriod: fromCalendarDate(period) },
  });
  await emitQms(
    scope.tx,
    { tenantId: scope.tenantId, userId: null, at: scope.at },
    'qms.indicator.due',
    {
      indicator_id: indicator.id,
      code: indicator.code,
      period: periodLabel(frequency, period),
      recipients: [indicator.responsibleId],
    },
  );
  return true;
}

async function tenantWork(deps: IndicatorWorkDeps, tenantId: string, at: Date) {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const scope: Scope = { tx, tenantId, at, today: bogotaToday(at) };
    const indicators = await tx.qmsIndicator.findMany({ where: { active: true, deletedAt: null } });
    let calculated = 0;
    let reminded = 0;
    for (const indicator of indicators) {
      const frequency = indicatorFrequencySchema.parse(indicator.frequency);
      const period = previousPeriodStart(frequency, scope.today);
      if (await measured(scope, indicator.id, period)) continue;
      if (isAutomaticSource(indicatorSourceSchema.parse(indicator.source))) {
        if (await calculate(scope, indicator, period)) calculated += 1;
      } else if (await remind(scope, indicator, period)) {
        reminded += 1;
      }
    }
    return { calculated, reminded };
  });
}

/** Recorre las empresas con indicadores activos; cada empresa en su propia transacción. */
export async function runQmsIndicatorWork(deps: IndicatorWorkDeps): Promise<IndicatorWorkResult> {
  const at = deps.clock.now();
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT qms_tenants_with_indicators()::text AS id`,
  );
  let calculated = 0;
  let reminded = 0;
  for (const { id } of tenants) {
    const result = await tenantWork(deps, id, at);
    calculated += result.calculated;
    reminded += result.reminded;
  }
  return { calculated, reminded };
}
