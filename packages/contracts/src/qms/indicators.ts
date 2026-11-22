import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { qmsDateSchema, qmsEnumOf, qmsIdSchema, qmsRefSchema, qmsTextSchema } from './common.js';

// Indicadores con ficha, medición, análisis y tendencia (B39; RE-SGC-006, matriz de indicadores).
// Los que la plataforma puede calcular se miden solos (decisiones 6 y 7); los demás los registra
// su responsable con evidencia (ficha 17.15). Cumple o no según la meta y si conviene que suba o
// baje; la tendencia compara con la medición anterior (decisión 8).

export const INDICATOR_FREQUENCIES = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
} as const;
export type IndicatorFrequency = keyof typeof INDICATOR_FREQUENCIES;
export const indicatorFrequencySchema = qmsEnumOf(INDICATOR_FREQUENCIES);

export const INDICATOR_DIRECTIONS = {
  higher_better: 'Mayor es mejor',
  lower_better: 'Menor es mejor',
} as const;
export type IndicatorDirection = keyof typeof INDICATOR_DIRECTIONS;
export const indicatorDirectionSchema = qmsEnumOf(INDICATOR_DIRECTIONS);

export const INDICATOR_UNITS = {
  percent: '%',
  count: 'Número',
  days: 'Días',
  pesos: 'Pesos',
  score: 'Puntaje',
} as const;
export type IndicatorUnit = keyof typeof INDICATOR_UNITS;
export const indicatorUnitSchema = qmsEnumOf(INDICATOR_UNITS);

interface AutomaticSource {
  readonly label: string;
  readonly unit: IndicatorUnit;
  readonly direction: IndicatorDirection;
  readonly formula: string;
}

/** Los indicadores que la plataforma calcula sola (decisión 6). */
export const AUTOMATIC_SOURCES = {
  qms_actions_effective: {
    label: 'Acciones eficaces',
    unit: 'percent',
    direction: 'higher_better',
    formula: 'Acciones verificadas eficaces ÷ acciones verificadas en el periodo × 100',
  },
  qms_actions_on_time: {
    label: 'Acciones ejecutadas a tiempo',
    unit: 'percent',
    direction: 'higher_better',
    formula:
      'Acciones ejecutadas hasta su fecha compromiso ÷ acciones ejecutadas en el periodo × 100',
  },
  qms_open_nonconformities: {
    label: 'No conformidades abiertas',
    unit: 'count',
    direction: 'lower_better',
    formula: 'No conformidades sin cerrar al final del periodo',
  },
  qms_audit_program: {
    label: 'Cumplimiento del programa de auditorías',
    unit: 'percent',
    direction: 'higher_better',
    formula: 'Auditorías con informe ÷ auditorías programadas hasta el final del periodo × 100',
  },
  svc_tickets_within_sla: {
    label: 'Tiquetes resueltos dentro del plazo acordado',
    unit: 'percent',
    direction: 'higher_better',
    formula: 'Tiquetes resueltos sin vencer el plazo ÷ tiquetes resueltos en el periodo × 100',
  },
  svc_pqrsf_on_time: {
    label: 'PQRSF respondidas a tiempo',
    unit: 'percent',
    direction: 'higher_better',
    formula: 'PQRSF respondidas hasta su fecha límite ÷ PQRSF respondidas en el periodo × 100',
  },
  svc_survey_satisfaction: {
    label: 'Satisfacción de los clientes',
    unit: 'score',
    direction: 'higher_better',
    formula: 'Promedio de la satisfacción (1 a 5) de las encuestas respondidas en el periodo',
  },
  sst_incidents: {
    label: 'Incidentes y accidentes de trabajo',
    unit: 'count',
    direction: 'lower_better',
    formula: 'Incidentes y accidentes ocurridos en el periodo',
  },
} as const satisfies Record<string, AutomaticSource>;
export type AutomaticSourceKey = keyof typeof AUTOMATIC_SOURCES;

export const INDICATOR_SOURCES = {
  manual: 'Registro manual con evidencia',
  ...Object.fromEntries(
    Object.entries(AUTOMATIC_SOURCES).map(([key, source]) => [key, `Automático: ${source.label}`]),
  ),
} as Record<'manual' | AutomaticSourceKey, string>;
export type IndicatorSource = 'manual' | AutomaticSourceKey;
export const indicatorSourceSchema = z.enum([
  'manual',
  ...(Object.keys(AUTOMATIC_SOURCES) as AutomaticSourceKey[]),
]);

export function isAutomaticSource(source: IndicatorSource): source is AutomaticSourceKey {
  return source !== 'manual';
}

export const INDICATOR_TRENDS = { up: 'Sube', down: 'Baja', steady: 'Estable' } as const;
export type IndicatorTrend = keyof typeof INDICATOR_TRENDS;
export const indicatorTrendSchema = qmsEnumOf(INDICATOR_TRENDS);

/** Valor de un indicador: hasta 14 enteros y 4 decimales, como texto para no perder exactitud. */
export const indicatorValueSchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/u, 'Escriba un número sin signo, con hasta cuatro decimales.');

const MONTHS_PER_PERIOD: Readonly<Record<IndicatorFrequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

function parts(date: string): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

function firstDay(year: number, month: number): string {
  const total = year * 12 + (month - 1);
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
}

/** El primer día del periodo que contiene la fecha. */
export function periodStartOf(frequency: IndicatorFrequency, date: string): string {
  const { year, month } = parts(date);
  const size = MONTHS_PER_PERIOD[frequency];
  return firstDay(year, Math.floor((month - 1) / size) * size + 1);
}

/** El primer día del periodo siguiente (fin exclusivo). */
export function periodEndOf(frequency: IndicatorFrequency, start: string): string {
  const { year, month } = parts(start);
  return firstDay(year, month + MONTHS_PER_PERIOD[frequency]);
}

/** El periodo anterior al que contiene la fecha: el último cerrado. */
export function previousPeriodStart(frequency: IndicatorFrequency, date: string): string {
  const { year, month } = parts(periodStartOf(frequency, date));
  return firstDay(year, month - MONTHS_PER_PERIOD[frequency]);
}

/** Nombre del periodo: «11/2026», «T4 2026», «S2 2026» o «2026». */
export function periodLabel(frequency: IndicatorFrequency, start: string): string {
  const { year, month } = parts(start);
  const index = Math.floor((month - 1) / MONTHS_PER_PERIOD[frequency]) + 1;
  const labels: Record<IndicatorFrequency, string> = {
    monthly: `${String(month).padStart(2, '0')}/${String(year)}`,
    quarterly: `T${String(index)} ${String(year)}`,
    semiannual: `S${String(index)} ${String(year)}`,
    annual: String(year),
  };
  return labels[frequency];
}

/** ¿El resultado cumple la meta? (decisión 8). */
export function meetsTarget(value: string, target: string, direction: IndicatorDirection): boolean {
  const comparison = new Decimal(value).comparedTo(new Decimal(target));
  return direction === 'higher_better' ? comparison >= 0 : comparison <= 0;
}

/** Sube, baja o se mantiene frente a la medición anterior (decisión 8). */
export function trendOf(current: string, previous: string | null): IndicatorTrend | null {
  if (previous === null) return null;
  const comparison = new Decimal(current).comparedTo(new Decimal(previous));
  return comparison > 0 ? 'up' : comparison < 0 ? 'down' : 'steady';
}

export const saveIndicatorSchema = z
  .strictObject({
    process_id: qmsIdSchema,
    name: qmsTextSchema(3, 200),
    objective: qmsTextSchema(5, 1000).describe('Qué se quiere lograr'),
    formula: qmsTextSchema(3, 500).describe('Cómo se calcula'),
    unit: indicatorUnitSchema,
    target: indicatorValueSchema.describe('Meta'),
    direction: indicatorDirectionSchema,
    frequency: indicatorFrequencySchema,
    source: indicatorSourceSchema,
    responsible_id: qmsIdSchema.describe('Cuenta de quien mide y analiza'),
    active: z.boolean().default(true),
  })
  .refine(
    (input) =>
      !isAutomaticSource(input.source) || AUTOMATIC_SOURCES[input.source].unit === input.unit,
    { path: ['unit'], message: 'La unidad no corresponde al cálculo automático elegido.' },
  );

export const recordMeasurementSchema = z.strictObject({
  period_start: qmsDateSchema.describe('Primer día del periodo que se mide'),
  value: indicatorValueSchema,
  analysis: qmsTextSchema(5, 2000).describe('Análisis del resultado'),
  evidence_note: qmsTextSchema(5, 1000).describe('De dónde sale el dato'),
  evidence_file_id: qmsIdSchema.nullable().default(null),
});

/** El análisis de una medición automática, que el responsable escribe después. */
export const analyzeMeasurementSchema = z.strictObject({
  analysis: qmsTextSchema(5, 2000),
});

export const calculateIndicatorSchema = z.strictObject({
  period_start: qmsDateSchema.optional().describe('Periodo; si falta, el último cerrado'),
});

export const indicatorMeasurementSchema = z.object({
  id: qmsIdSchema,
  period_start: qmsDateSchema,
  period: z.string(),
  value: z.string(),
  meets: z.boolean(),
  trend: indicatorTrendSchema.nullable(),
  analysis: z.string().nullable(),
  evidence_note: z.string().nullable(),
  evidence_file_id: qmsIdSchema.nullable(),
  automatic: z.boolean(),
  measured_by: qmsRefSchema.nullable(),
  version: z.number().int().positive(),
});

export const indicatorSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  process: qmsRefSchema,
  name: z.string(),
  objective: z.string(),
  formula: z.string(),
  unit: indicatorUnitSchema,
  target: z.string(),
  direction: indicatorDirectionSchema,
  frequency: indicatorFrequencySchema,
  source: indicatorSourceSchema,
  responsible: qmsRefSchema,
  active: z.boolean(),
  last: indicatorMeasurementSchema.nullable(),
  /** El último periodo cerrado no tiene medición. */
  pending_period: qmsDateSchema.nullable(),
  version: z.number().int().positive(),
});
export const indicatorListResponseSchema = z.object({ data: z.array(indicatorSchema) });

export const indicatorSeriesResponseSchema = z.object({
  indicator: indicatorSchema,
  data: z.array(indicatorMeasurementSchema),
});

/** Columnas de la matriz de indicadores, en el orden de RE-SGC-006 (por validar, decisión 10). */
export const INDICATOR_MATRIX_COLUMNS = [
  'Proceso',
  'Código',
  'Indicador',
  'Objetivo',
  'Fórmula',
  'Unidad',
  'Meta',
  'Frecuencia',
  'Fuente',
  'Responsable',
  'Último periodo',
  'Resultado',
  'Cumple',
  'Tendencia',
  'Análisis',
] as const;

export type SaveIndicator = z.infer<typeof saveIndicatorSchema>;
export type RecordMeasurement = z.infer<typeof recordMeasurementSchema>;
export type AnalyzeMeasurement = z.infer<typeof analyzeMeasurementSchema>;
export type CalculateIndicator = z.infer<typeof calculateIndicatorSchema>;
export type IndicatorMeasurement = z.infer<typeof indicatorMeasurementSchema>;
export type Indicator = z.infer<typeof indicatorSchema>;
export type IndicatorSeriesResponse = z.infer<typeof indicatorSeriesResponseSchema>;
