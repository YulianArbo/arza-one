import { z } from 'zod';

import { recordNameSchema } from './org.js';

// Parámetros con vigencia, festivos y días hábiles (M00, B12). Un parámetro nunca se sobrescribe:
// cada cambio es una vigencia nueva y la anterior se conserva (ficha 17.1).

/** Fecha de calendario, sin hora: 2026-04-02. */
export const calendarDateSchema = z.iso.date();

// --- Parámetros ----------------------------------------------------------------------------

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:MM');

const shiftSchema = z
  .strictObject({ start: timeSchema, end: timeSchema })
  .refine((shift) => shift.start < shift.end, 'La hora final debe ser posterior a la inicial');

/** Horario laboral: días de la semana (1 lunes … 7 domingo) y las dos jornadas del día. */
export const workScheduleSchema = z
  .strictObject({
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Hay días repetidos'),
    morning: shiftSchema,
    afternoon: shiftSchema,
  })
  .refine(
    (schedule) => schedule.morning.end <= schedule.afternoon.start,
    'La jornada de la tarde debe empezar después de terminar la de la mañana',
  );

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Horas de trabajo a la semana de un horario. */
export function weeklyHours(schedule: WorkSchedule): number {
  const shifts = [schedule.morning, schedule.afternoon];
  const daily = shifts.reduce((sum, s) => sum + minutesOf(s.end) - minutesOf(s.start), 0);
  return (daily * schedule.days.length) / 60;
}

/** Parámetros que existen y lo que significan. Cada módulo agrega aquí los suyos. */
export const PARAMETER_DEFINITIONS = {
  'work.schedule': {
    label: 'Horario laboral',
    description:
      'Días y horas de la jornada. Gobierna los vencimientos en días hábiles y las notificaciones.',
  },
  'crm.discount_cap': {
    label: 'Tope de descuento sin aprobación',
    description:
      'Descuento máximo por ítem que una cotización lleva sin aprobación de la Dirección (ficha 17.6).',
  },
} as const;

export type ParameterKey = keyof typeof PARAMETER_DEFINITIONS;

export function isParameterKey(value: string): value is ParameterKey {
  return Object.hasOwn(PARAMETER_DEFINITIONS, value);
}

/** Tope de descuento (B23): porcentaje con hasta dos decimales, de 0 a 100. */
export const discountCapSchema = z.strictObject({
  percent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/u, 'Escriba el porcentaje con punto decimal: 10.5')
    .refine((value) => Number(value) <= 100, 'El tope no puede pasar de 100 %.'),
});

/** Esquema del valor de cada parámetro: la API valida la vigencia nueva con el de su clave. */
export const PARAMETER_VALUE_SCHEMAS = {
  'work.schedule': workScheduleSchema,
  'crm.discount_cap': discountCapSchema,
} as const satisfies Record<ParameterKey, z.ZodType>;

const parameterValueSchema = z.union([workScheduleSchema, discountCapSchema]);

/** El valor es un horario laboral (y no otro parámetro). */
export function isWorkSchedule(value: ParameterValue): value is WorkSchedule {
  return 'days' in value;
}

const personRefSchema = z.object({ id: z.uuid(), name: z.string() });

export const parameterVersionSchema = z.object({
  id: z.uuid(),
  value: parameterValueSchema,
  valid_from: calendarDateSchema,
  valid_to: calendarDateSchema.nullable().describe('Último día de vigencia; vacío si sigue'),
  created_at: z.iso.datetime({ offset: true }),
  created_by: personRefSchema.nullable().describe('Vacío si lo cargó el sistema'),
});

export const parameterSummarySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  current: parameterVersionSchema.nullable().describe('Vigencia de hoy'),
  scheduled: parameterVersionSchema.nullable().describe('Vigencia que empieza más adelante'),
});

export const parameterListResponseSchema = z.object({ data: z.array(parameterSummarySchema) });

export const parameterHistoryResponseSchema = z.object({
  key: z.string(),
  label: z.string(),
  data: z.array(parameterVersionSchema).describe('De la más reciente a la más antigua'),
});

export const createParameterVersionRequestSchema = z.strictObject({
  value: parameterValueSchema,
  valid_from: calendarDateSchema.describe('Primer día de la vigencia; hoy o más adelante'),
});

// --- Festivos y días hábiles ---------------------------------------------------------------

export const holidaySchema = z.object({
  id: z.uuid(),
  date: calendarDateSchema,
  name: z.string(),
});

export const holidayListQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const holidayListResponseSchema = z.object({ data: z.array(holidaySchema) });

export const createHolidayRequestSchema = z.strictObject({
  date: calendarDateSchema,
  name: recordNameSchema,
});

export const businessDaysQuerySchema = z.strictObject({
  from: calendarDateSchema.describe('Fecha de partida, que no cuenta'),
  days: z.coerce.number().int().min(1).max(365).describe('Días hábiles a sumar'),
});

export const businessDaysResponseSchema = z.object({
  from: calendarDateSchema,
  days: z.number().int(),
  date: calendarDateSchema.describe('Fecha en que se cumple el plazo'),
});

export type WorkSchedule = z.infer<typeof workScheduleSchema>;
export type DiscountCap = z.infer<typeof discountCapSchema>;
export type ParameterValue = z.infer<typeof parameterValueSchema>;
export type ParameterVersion = z.infer<typeof parameterVersionSchema>;
export type ParameterSummary = z.infer<typeof parameterSummarySchema>;
export type ParameterListResponse = z.infer<typeof parameterListResponseSchema>;
export type ParameterHistoryResponse = z.infer<typeof parameterHistoryResponseSchema>;
export type CreateParameterVersionRequest = z.infer<typeof createParameterVersionRequestSchema>;
export type Holiday = z.infer<typeof holidaySchema>;
export type HolidayListResponse = z.infer<typeof holidayListResponseSchema>;
export type CreateHolidayRequest = z.infer<typeof createHolidayRequestSchema>;
export type BusinessDaysQuery = z.infer<typeof businessDaysQuerySchema>;
export type BusinessDaysResponse = z.infer<typeof businessDaysResponseSchema>;
