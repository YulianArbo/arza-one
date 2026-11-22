import {
  INDICATOR_DIRECTIONS,
  INDICATOR_FREQUENCIES,
  INDICATOR_SOURCES,
  INDICATOR_TRENDS,
  INDICATOR_UNITS,
  indicatorFrequencySchema,
  periodLabel,
  previousPeriodStart,
  trendOf,
  type Indicator,
  type IndicatorMeasurement,
  type QmsRef,
} from '@arza/contracts';

import type {
  QmsIndicator as QmsIndicatorRow,
  QmsMeasurement as QmsMeasurementRow,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { CsvCell } from '../../../platform/export/csv.js';
import { toCalendarDate } from '../../core/index.js';
import { optionalRef, processRefs, refOf, userRefs } from './qms-support.js';

// La ficha de cada indicador con su última medición, si cumple la meta y su tendencia (decisión 8),
// y la fila de la matriz RE-SGC-006 (decisión 10).

/** Un valor numeric(18,4) como texto sin ceros de sobra: 85.5000 → 85.5. */
export function valueText(value: { toString(): string }): string {
  const text = value.toString();
  return text.includes('.') ? text.replace(/\.?0+$/u, '') : text;
}

export interface IndicatorRefs {
  readonly people: ReadonlyMap<string, QmsRef>;
  readonly processes: ReadonlyMap<string, QmsRef>;
}

export async function indicatorRefs(
  tx: TenantTransaction,
  indicators: readonly QmsIndicatorRow[],
  measurements: readonly QmsMeasurementRow[],
): Promise<IndicatorRefs> {
  return {
    people: await userRefs(tx, [
      ...indicators.map((row) => row.responsibleId),
      ...measurements.map((row) => row.measuredBy),
    ]),
    processes: await processRefs(
      tx,
      indicators.map((row) => row.processId),
    ),
  };
}

/** La medición y la anterior a ella (para la tendencia). */
export function measurementView(
  row: QmsMeasurementRow,
  previous: QmsMeasurementRow | undefined,
  indicator: QmsIndicatorRow,
  people: ReadonlyMap<string, QmsRef>,
): IndicatorMeasurement {
  const frequency = indicatorFrequencySchema.parse(indicator.frequency);
  const start = toCalendarDate(row.periodStart);
  return {
    id: row.id,
    period_start: start,
    period: periodLabel(frequency, start),
    value: valueText(row.value),
    meets: row.meets,
    trend: trendOf(row.value.toString(), previous === undefined ? null : previous.value.toString()),
    analysis: row.analysis,
    evidence_note: row.evidenceNote,
    evidence_file_id: row.evidenceFileId,
    automatic: row.automatic,
    measured_by: optionalRef(people, row.measuredBy, 'Persona'),
    version: row.version,
  };
}

/** Las mediciones del indicador, de la más antigua a la más reciente. */
export function seriesView(
  indicator: QmsIndicatorRow,
  rows: readonly QmsMeasurementRow[],
  people: ReadonlyMap<string, QmsRef>,
): IndicatorMeasurement[] {
  return rows.map((row, index) => measurementView(row, rows[index - 1], indicator, people));
}

export function indicatorView(
  row: QmsIndicatorRow,
  ascending: readonly QmsMeasurementRow[],
  refs: IndicatorRefs,
  today: string,
): Indicator {
  const series = seriesView(row, ascending, refs.people);
  const frequency = indicatorFrequencySchema.parse(row.frequency);
  const closed = previousPeriodStart(frequency, today);
  const measured = series.some((item) => item.period_start === closed);
  return {
    id: row.id,
    code: row.code,
    process: refOf(refs.processes, row.processId, 'Proceso'),
    name: row.name,
    objective: row.objective,
    formula: row.formula,
    unit: row.unit as Indicator['unit'],
    target: valueText(row.target),
    direction: row.direction as Indicator['direction'],
    frequency,
    source: row.source as Indicator['source'],
    responsible: refOf(refs.people, row.responsibleId),
    active: row.active,
    last: series.at(-1) ?? null,
    pending_period: row.active && !measured ? closed : null,
    version: row.version,
  };
}

/** Una fila de la matriz, en el orden de INDICATOR_MATRIX_COLUMNS. */
export function matrixRow(indicator: Indicator): CsvCell[] {
  const last = indicator.last;
  const trend = last?.trend ?? null;
  return [
    indicator.process.name,
    indicator.code,
    indicator.name,
    indicator.objective,
    indicator.formula,
    INDICATOR_UNITS[indicator.unit],
    `${indicator.target} (${INDICATOR_DIRECTIONS[indicator.direction].toLowerCase()})`,
    INDICATOR_FREQUENCIES[indicator.frequency],
    INDICATOR_SOURCES[indicator.source],
    indicator.responsible.name,
    last?.period ?? null,
    last?.value ?? null,
    last === null ? null : last.meets ? 'Sí' : 'No',
    trend === null ? null : INDICATOR_TRENDS[trend],
    last?.analysis ?? null,
  ];
}
