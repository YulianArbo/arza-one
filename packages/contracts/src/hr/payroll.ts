import { z } from 'zod';

import { moneySchema, periodSchema } from '../finance/money.js';
import { hrRefSchema } from './selection.js';

// Novedades de nómina (B36, ficha 17.13, decisión 6). El periodo es el mes. Las vacaciones y
// licencias aprobadas, las horas extras reportadas y los retiros llegan solos; Talento humano
// registra las demás. Al cerrar el mes ya nada cambia y se descarga el archivo para el software de
// nómina, que es donde ocurre la liquidación. Lo que llega con el mes cerrado va al siguiente.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Catálogo editable de los conceptos (por validar contra RE-GTH-003, que no está en el repo). */
export const NOVELTY_CONCEPTS_CATALOG = 'hr_novelty_concepts';

/** Conceptos que la plataforma genera sola; los demás del catálogo se registran a mano. */
export const AUTOMATIC_CONCEPTS = {
  vacation: 'VACACIONES',
  paidLeave: 'LICENCIA_REMUNERADA',
  unpaidLeave: 'LICENCIA_NO_REMUNERADA',
  sickLeave: 'INCAPACIDAD',
  overtimeDay: 'HE_DIURNA',
  overtimeNight: 'HE_NOCTURNA',
  overtimeHolidayDay: 'HE_DOMINICAL_DIURNA',
  overtimeHolidayNight: 'HE_DOMINICAL_NOCTURNA',
  termination: 'RETIRO',
} as const;

export const AUTOMATIC_CONCEPT_CODES: readonly string[] = Object.values(AUTOMATIC_CONCEPTS);

export const NOVELTY_UNITS = { days: 'Días', hours: 'Horas', units: 'Unidades' } as const;
export type NoveltyUnit = keyof typeof NOVELTY_UNITS;
export const noveltyUnitSchema = enumOf(NOVELTY_UNITS);

export const NOVELTY_SOURCES = {
  leave: 'Ausencia',
  overtime: 'Horas extras',
  offboarding: 'Retiro',
  manual: 'Registro manual',
} as const;
export type NoveltySource = keyof typeof NOVELTY_SOURCES;
export const noveltySourceSchema = enumOf(NOVELTY_SOURCES);

export const PAYROLL_PERIOD_STATUS = { open: 'Abierto', closed: 'Cerrado' } as const;
export type PayrollPeriodStatus = keyof typeof PAYROLL_PERIOD_STATUS;
export const payrollPeriodStatusSchema = enumOf(PAYROLL_PERIOD_STATUS);

const conceptCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/u, 'Seleccione un concepto.');

/** Cantidad con hasta dos decimales, mayor que cero. */
export const noveltyQuantitySchema = z
  .string()
  .trim()
  .regex(/^(?=.*[1-9])\d{1,6}(\.\d{1,2})?$/u, 'Escriba una cantidad mayor que cero.');

export const payrollNoveltySchema = z.object({
  id: idSchema,
  period: periodSchema,
  employee: hrRefSchema,
  concept: z.string(),
  concept_label: z.string(),
  quantity: z.string(),
  unit: noveltyUnitSchema,
  amount: moneySchema.nullable(),
  starts_on: dateSchema.nullable(),
  ends_on: dateSchema.nullable(),
  source: noveltySourceSchema,
  note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const payrollPeriodSchema = z.object({
  period: periodSchema,
  status: payrollPeriodStatusSchema,
  novelties: z.number().int().nonnegative(),
  closed_on: dateSchema.nullable(),
  closed_by: hrRefSchema.nullable(),
});

export const payrollPeriodListResponseSchema = z.object({ data: z.array(payrollPeriodSchema) });

export const payrollPeriodDetailResponseSchema = z.object({
  period: payrollPeriodSchema,
  data: z.array(payrollNoveltySchema),
});

export const noveltyListResponseSchema = z.object({ data: z.array(payrollNoveltySchema) });

export const registerNoveltySchema = z.strictObject({
  period: periodSchema,
  employee_id: idSchema,
  concept: conceptCodeSchema,
  quantity: noveltyQuantitySchema,
  unit: noveltyUnitSchema,
  amount: moneySchema.nullable().default(null).describe('Valor en pesos, si aplica'),
  note: textSchema(1, 500).nullable().default(null),
});

/** Mes de nómina, AAAA-MM. */
export const payrollMonthSchema = periodSchema;

export const closePayrollPeriodSchema = z.strictObject({
  period: periodSchema,
  confirm: z.literal(true, 'Marque la casilla para cerrar el mes.'),
});

export const noveltyConceptOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
  automatic: z.boolean(),
});
export const noveltyConceptListResponseSchema = z.object({
  data: z.array(noveltyConceptOptionSchema),
});

export type PayrollNovelty = z.infer<typeof payrollNoveltySchema>;
export type PayrollPeriod = z.infer<typeof payrollPeriodSchema>;
export type PayrollPeriodDetail = z.infer<typeof payrollPeriodDetailResponseSchema>;
export type RegisterNovelty = z.infer<typeof registerNoveltySchema>;
export type ClosePayrollPeriod = z.infer<typeof closePayrollPeriodSchema>;
export type NoveltyConceptOption = z.infer<typeof noveltyConceptOptionSchema>;
