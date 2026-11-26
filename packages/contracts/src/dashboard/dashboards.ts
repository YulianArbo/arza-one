import { z } from 'zod';

import {
  indicatorTrendSchema,
  indicatorUnitSchema,
  SCORECARD_PERSPECTIVES,
  scorecardPerspectiveSchema,
} from '../qms/index.js';
import { FIGURE_KEYS, FIGURE_UNITS } from './figures.js';

// Respuestas de los tableros de la Dirección (B46): tablero gerencial, tablero de cumplimiento,
// cuadro de mando y el detalle de los registros detrás de cada cifra.

export const figureKeySchema = z.enum(FIGURE_KEYS).describe('Cifra');
export const figureUnitSchema = z.enum(
  Object.keys(FIGURE_UNITS) as [keyof typeof FIGURE_UNITS, ...(keyof typeof FIGURE_UNITS)[]],
);

export const dashboardFigureSchema = z.object({
  key: figureKeySchema,
  label: z.string(),
  unit: figureUnitSchema,
  /** Sin permiso para el listado de origen, o sin datos que medir, no hay valor. */
  value: z.string().nullable(),
  /** Dato que acompaña la cifra, por ejemplo cuántos registros suma. */
  detail: z.string().nullable(),
  how: z.string(),
  allowed: z.boolean(),
  link: z.string(),
});

export const dashboardDataResponseSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  figures: z.array(dashboardFigureSchema),
});

export const drilldownQuerySchema = z.strictObject({ figure: figureKeySchema });

export const drilldownResponseSchema = z.object({
  figure: figureKeySchema,
  label: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(z.object({ id: z.string(), cells: z.record(z.string(), z.string()) })),
  /** Se muestran los primeros 200; el listado completo está en el módulo. */
  truncated: z.boolean(),
  link: z.string(),
});

export const SCORECARD_STATUSES = {
  meets: 'Cumple',
  partial: 'Cumple en parte',
  fails: 'No cumple',
  no_data: 'Sin mediciones',
} as const;
export type ScorecardStatus = keyof typeof SCORECARD_STATUSES;
export const scorecardStatusSchema = z.enum(
  Object.keys(SCORECARD_STATUSES) as [ScorecardStatus, ...ScorecardStatus[]],
);

/** Cumple si todos sus indicadores medidos cumplen; no cumple si ninguno. */
export function scorecardStatusOf(meets: readonly (boolean | null)[]): ScorecardStatus {
  const measured = meets.filter((value): value is boolean => value !== null);
  if (measured.length === 0) return 'no_data';
  if (measured.every(Boolean)) return 'meets';
  return measured.some(Boolean) ? 'partial' : 'fails';
}

export const scorecardIndicatorSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  process: z.string(),
  unit: indicatorUnitSchema,
  target: z.string(),
  value: z.string().nullable(),
  period: z.string().nullable(),
  meets: z.boolean().nullable(),
  trend: indicatorTrendSchema.nullable(),
});

export const scorecardObjectiveSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  status: scorecardStatusSchema,
  indicators: z.array(scorecardIndicatorSchema),
});

export const scorecardResponseSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  /** «all»: toda la empresa; «own»: solo los procesos que dirige su cargo (decisión 5). */
  scope: z.enum(['all', 'own']),
  perspectives: z.array(
    z.object({
      perspective: scorecardPerspectiveSchema,
      label: z.string(),
      objectives: z.array(scorecardObjectiveSchema),
    }),
  ),
});

export const PERSPECTIVE_ORDER = Object.keys(SCORECARD_PERSPECTIVES) as [
  keyof typeof SCORECARD_PERSPECTIVES,
  ...(keyof typeof SCORECARD_PERSPECTIVES)[],
];

export type DashboardFigure = z.infer<typeof dashboardFigureSchema>;
export type DashboardData = z.infer<typeof dashboardDataResponseSchema>;
export type DrilldownQuery = z.infer<typeof drilldownQuerySchema>;
export type Drilldown = z.infer<typeof drilldownResponseSchema>;
export type ScorecardIndicator = z.infer<typeof scorecardIndicatorSchema>;
export type ScorecardObjective = z.infer<typeof scorecardObjectiveSchema>;
export type Scorecard = z.infer<typeof scorecardResponseSchema>;
