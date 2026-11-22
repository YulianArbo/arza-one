import type { AutomaticSourceKey } from '@arza/contracts';
import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaStartOf, fromCalendarDate } from '../../core/index.js';
import { serviceQualityFigures } from '../../service/index.js';
import { incidentCountForQuality } from '../../sst/index.js';

// Los indicadores que la plataforma calcula sola (B39, decisión 6). Cada cálculo mira un periodo
// [inicio, fin) en fechas de Colombia. Si el dato no existe (nada que dividir), no hay medición:
// la plataforma no inventa un 0 %. Servicio y SST entregan sus cifras por su interfaz pública.

export interface MeasuredPeriod {
  /** Primer día del periodo (AAAA-MM-DD). */
  readonly start: string;
  /** Primer día del periodo siguiente. */
  readonly end: string;
}

type Calculator = (tx: TenantTransaction, period: MeasuredPeriod) => Promise<string | null>;

/** num ÷ den × 100 con dos decimales; null si no hay base. */
export function percentOf(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  return new Decimal(numerator).div(denominator).mul(100).toDecimalPlaces(2).toFixed(2);
}

function averageOf(total: number, count: number): string | null {
  if (count === 0) return null;
  return new Decimal(total).div(count).toDecimalPlaces(2).toFixed(2);
}

function dates(period: MeasuredPeriod) {
  return { gte: fromCalendarDate(period.start), lt: fromCalendarDate(period.end) };
}

function instants(period: MeasuredPeriod) {
  return { from: bogotaStartOf(period.start), to: bogotaStartOf(period.end) };
}

const actionsEffective: Calculator = async (tx, period) => {
  const verified = { verifiedOn: dates(period), deletedAt: null };
  const [all, effective] = await Promise.all([
    tx.qmsAction.count({ where: { ...verified, status: { in: ['effective', 'ineffective'] } } }),
    tx.qmsAction.count({ where: { ...verified, status: 'effective' } }),
  ]);
  return percentOf(effective, all);
};

const actionsOnTime: Calculator = async (tx, period) => {
  const executed = await tx.qmsAction.findMany({
    where: { executedOn: dates(period), deletedAt: null },
    select: { executedOn: true, dueOn: true },
  });
  const onTime = executed.filter(
    (row) => row.executedOn !== null && row.executedOn.getTime() <= row.dueOn.getTime(),
  );
  return percentOf(onTime.length, executed.length);
};

const openNonconformities: Calculator = async (tx, period) => {
  const end = fromCalendarDate(period.end);
  const open = await tx.qmsNonconformity.count({
    where: {
      detectedOn: { lt: end },
      deletedAt: null,
      OR: [{ closedOn: null }, { closedOn: { gte: end } }],
    },
  });
  return String(open);
};

const auditProgram: Calculator = async (tx, period) => {
  const year = Number(period.start.slice(0, 4));
  const planned = {
    plannedOn: { lt: fromCalendarDate(period.end) },
    status: { not: 'cancelled' },
    program: { year },
    deletedAt: null,
  };
  const [all, reported] = await Promise.all([
    tx.qmsAudit.count({ where: planned }),
    tx.qmsAudit.count({ where: { ...planned, status: { in: ['reported', 'closed'] } } }),
  ]);
  return percentOf(reported, all);
};

const ticketsWithinSla: Calculator = async (tx, period) => {
  const figures = await serviceQualityFigures(tx, instants(period));
  return percentOf(figures.ticketsWithinSla, figures.ticketsResolved);
};

const pqrsfOnTime: Calculator = async (tx, period) => {
  const figures = await serviceQualityFigures(tx, instants(period));
  return percentOf(figures.pqrsfOnTime, figures.pqrsfResponded);
};

const surveySatisfaction: Calculator = async (tx, period) => {
  const figures = await serviceQualityFigures(tx, instants(period));
  return averageOf(figures.satisfactionTotal, figures.surveysAnswered);
};

const incidents: Calculator = async (tx, period) =>
  String(await incidentCountForQuality(tx, instants(period)));

const CALCULATORS: Readonly<Record<AutomaticSourceKey, Calculator>> = {
  qms_actions_effective: actionsEffective,
  qms_actions_on_time: actionsOnTime,
  qms_open_nonconformities: openNonconformities,
  qms_audit_program: auditProgram,
  svc_tickets_within_sla: ticketsWithinSla,
  svc_pqrsf_on_time: pqrsfOnTime,
  svc_survey_satisfaction: surveySatisfaction,
  sst_incidents: incidents,
};

/** El valor del periodo, o null si la plataforma no tiene con qué calcularlo. */
export async function calculateSource(
  tx: TenantTransaction,
  source: AutomaticSourceKey,
  period: MeasuredPeriod,
): Promise<string | null> {
  return CALCULATORS[source](tx, period);
}
