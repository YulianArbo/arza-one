import {
  ACTION_STATUSES,
  actionStatusSchema,
  AUDIT_STATUSES,
  auditStatusSchema,
  CONTEXT_KINDS,
  contextKindSchema,
  IMPACT_LEVELS,
  impactLevelSchema,
  INDICATOR_TRENDS,
  INDICATOR_UNITS,
  QMS_RISK_LEVELS,
  qmsRiskLevelSchema,
  type Indicator,
  type ReviewInputKey,
} from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaStartOf, fromCalendarDate } from '../../core/index.js';
import { serviceQualityFigures } from '../../service/index.js';
import { incidentCountForQuality } from '../../sst/index.js';
import { percentOf } from './indicator-sources.js';
import { indicatorRefs, indicatorView } from './indicator-views.js';
import { processRefs, refOf } from './qms-support.js';

// Las entradas que la plataforma precarga en el acta de revisión por la dirección (B39; RE-SGC-007,
// ISO 9001 9.3.2). Cada entrada es una lista de frases cortas con las cifras del periodo; Calidad y
// la Dirección agregan su comentario. Nunca llevan datos personales de clientes ni de afectados.

export interface ReviewPeriod {
  readonly reviewId: string;
  readonly from: string;
  readonly to: string;
}

type LineBuilder = (tx: TenantTransaction, period: ReviewPeriod) => Promise<string[]>;

const MAX_LINES = 30;

function orNone(lines: string[], none: string): string[] {
  return lines.length === 0 ? [none] : lines.slice(0, MAX_LINES);
}

function dateRange(period: ReviewPeriod) {
  return { gte: fromCalendarDate(period.from), lte: fromCalendarDate(period.to) };
}

const previousActions: LineBuilder = async (tx, period) => {
  const rows = await tx.qmsAction.findMany({
    where: { originType: 'management_review', reviewId: { not: period.reviewId }, deletedAt: null },
    orderBy: { code: 'asc' },
    take: MAX_LINES,
  });
  const lines = rows.map(
    (row) =>
      `${row.code} · ${row.description} · ${ACTION_STATUSES[actionStatusSchema.parse(row.status)]}`,
  );
  return orNone(lines, 'No hay acciones de revisiones anteriores.');
};

const context: LineBuilder = async (tx, period) => {
  const rows = await tx.qmsContextItem.findMany({
    where: { year: Number(period.to.slice(0, 4)), deletedAt: null },
    orderBy: [{ kind: 'asc' }, { impact: 'asc' }],
  });
  const lines = rows.map((row) => {
    const kind = CONTEXT_KINDS[contextKindSchema.parse(row.kind)];
    const impact = IMPACT_LEVELS[impactLevelSchema.parse(row.impact)].toLowerCase();
    return `${kind} (impacto ${impact}): ${row.description}`;
  });
  return orNone(lines, 'No hay factores de contexto registrados para el año.');
};

const customer: LineBuilder = async (tx, period) => {
  const figures = await serviceQualityFigures(tx, {
    from: bogotaStartOf(period.from),
    to: bogotaStartOf(addDays(period.to, 1)),
  });
  const satisfaction =
    figures.surveysAnswered === 0
      ? 'Sin encuestas respondidas en el periodo.'
      : `Encuestas respondidas: ${String(figures.surveysAnswered)}; satisfacción promedio ${(figures.satisfactionTotal / figures.surveysAnswered).toFixed(2)} de 5.`;
  return [
    satisfaction,
    `PQRSF recibidas: ${String(figures.pqrsfReceived)}; respondidas: ${String(figures.pqrsfResponded)} (${String(figures.pqrsfOnTime)} a tiempo); procedentes: ${String(figures.pqrsfWellFounded)}.`,
    `Tiquetes resueltos: ${String(figures.ticketsResolved)}; dentro del plazo acordado: ${percentOf(figures.ticketsWithinSla, figures.ticketsResolved) ?? '—'} %.`,
  ];
};

const nonconformities: LineBuilder = async (tx, period) => {
  const detected = { detectedOn: dateRange(period), deletedAt: null };
  const [total, fromAudit, closed, open, incidents] = await Promise.all([
    tx.qmsNonconformity.count({ where: detected }),
    tx.qmsNonconformity.count({ where: { ...detected, source: 'audit' } }),
    tx.qmsNonconformity.count({ where: { closedOn: dateRange(period), deletedAt: null } }),
    tx.qmsNonconformity.count({ where: { status: { not: 'closed' }, deletedAt: null } }),
    incidentCountForQuality(tx, {
      from: bogotaStartOf(period.from),
      to: bogotaStartOf(addDays(period.to, 1)),
    }),
  ]);
  const actions = await tx.qmsAction.groupBy({
    by: ['status'],
    where: { createdAt: { lt: bogotaStartOf(addDays(period.to, 1)) }, deletedAt: null },
    _count: { _all: true },
  });
  const byStatus = actions
    .map(
      (group) =>
        `${ACTION_STATUSES[actionStatusSchema.parse(group.status)]}: ${String(group._count._all)}`,
    )
    .join('; ');
  return [
    `No conformidades detectadas en el periodo: ${String(total)} (${String(fromAudit)} de auditoría); cerradas en el periodo: ${String(closed)}; abiertas hoy: ${String(open)}.`,
    `Acciones por estado: ${byStatus === '' ? 'ninguna' : byStatus}.`,
    `Incidentes y accidentes de trabajo en el periodo: ${String(incidents)}.`,
  ];
};

const audits: LineBuilder = async (tx, period) => {
  const rows = await tx.qmsAudit.findMany({
    where: { plannedOn: dateRange(period), deletedAt: null },
    include: { findings: { where: { deletedAt: null }, select: { findingType: true } } },
    orderBy: { plannedOn: 'asc' },
  });
  const processes = await processRefs(
    tx,
    rows.map((row) => row.processId),
  );
  const lines = rows.map((row) => {
    const status = AUDIT_STATUSES[auditStatusSchema.parse(row.status)];
    const ncs = row.findings.filter((f) => ['major', 'minor'].includes(f.findingType)).length;
    return `${row.code} · ${refOf(processes, row.processId, 'Proceso').name} · ${status} · ${String(row.findings.length)} hallazgos (${String(ncs)} no conformidades)`;
  });
  return orNone(lines, 'No hubo auditorías programadas en el periodo.');
};

const risks: LineBuilder = async (tx) => {
  const rows = await tx.qmsRisk.findMany({
    where: { level: { in: ['high', 'critical'] }, status: 'active', deletedAt: null },
    orderBy: { score: 'desc' },
    take: MAX_LINES,
  });
  const lines = rows.map(
    (row) =>
      `${row.code} · ${QMS_RISK_LEVELS[qmsRiskLevelSchema.parse(row.level)]} (${String(row.score)}) · ${row.description}`,
  );
  return orNone(lines, 'No hay riesgos altos ni críticos vigentes.');
};

/** La línea de un indicador en la entrada «Desempeño de los procesos». */
export function indicatorLine(indicator: Indicator): string {
  const head = `${indicator.code} ${indicator.name} (${indicator.process.name})`;
  const last = indicator.last;
  if (last === null) return `${head}: sin medición.`;
  const unit =
    indicator.unit === 'percent' ? ' %' : ` ${INDICATOR_UNITS[indicator.unit].toLowerCase()}`;
  const trend = last.trend === null ? '' : ` · ${INDICATOR_TRENDS[last.trend].toLowerCase()}`;
  return `${head}: ${last.value}${unit} en ${last.period} · meta ${indicator.target} · ${last.meets ? 'cumple' : 'no cumple'}${trend}`;
}

/** El último resultado de cada indicador activo dentro del periodo revisado. */
const indicators: LineBuilder = async (tx, period) => {
  const rows = await tx.qmsIndicator.findMany({
    where: { active: true, deletedAt: null },
    orderBy: { code: 'asc' },
    include: {
      measurements: {
        where: { periodStart: { lte: fromCalendarDate(period.to) }, deletedAt: null },
        orderBy: { periodStart: 'asc' },
      },
    },
  });
  const refs = await indicatorRefs(
    tx,
    rows,
    rows.flatMap((row) => row.measurements),
  );
  const lines = rows.map((row) =>
    indicatorLine(indicatorView(row, row.measurements, refs, period.to)),
  );
  return orNone(lines, 'No hay indicadores activos.');
};

const AUTOMATIC: Readonly<Partial<Record<ReviewInputKey, LineBuilder>>> = {
  previous_actions: previousActions,
  context,
  customer,
  indicators,
  nonconformities,
  audits,
  risks,
};

/** Las líneas de cada entrada automática del acta. */
export async function automaticLines(
  tx: TenantTransaction,
  period: ReviewPeriod,
): Promise<Map<ReviewInputKey, string[]>> {
  const result = new Map<ReviewInputKey, string[]>();
  for (const [key, build] of Object.entries(AUTOMATIC) as [ReviewInputKey, LineBuilder][]) {
    result.set(key, await build(tx, period));
  }
  return result;
}
