import { z } from 'zod';

import { calendarDateSchema, personRefSchema, versionSchema } from '../crm/common.js';
import { optionalText, requiredText } from '../contract/common.js';
import { hasAtMostDecimals, TIME_RULES, timeEntryStatusSchema } from './common.js';

// Registro de horas (B27, ficha 17.8): facturables y no facturables, con máximo siete días de
// atraso, en cuartos de hora. El Líder técnico aprueba o devuelve; nadie aprueba las suyas.

export const loggedHoursSchema = z
  .number()
  .min(TIME_RULES.step, 'Registre al menos un cuarto de hora (0,25).')
  .max(TIME_RULES.maxPerDay, 'Un día tiene como máximo 24 horas.')
  .refine(
    (hours) => hasAtMostDecimals(hours / TIME_RULES.step, 0),
    'Registre las horas en cuartos de hora: 0,25 · 0,5 · 0,75 · 1…',
  )
  .describe('Horas trabajadas, en cuartos de hora');

export const timeEntryRequestSchema = z.strictObject({
  work_date: calendarDateSchema.describe('Día trabajado; máximo siete días atrás'),
  hours: loggedHoursSchema,
  item_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Ítem del proyecto; vacío para trabajo general del proyecto'),
  billable: z.boolean().default(true).describe('Se cobra al cliente'),
  note: optionalText(500).describe('Qué se hizo'),
});

export const approveTimeRequestSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1, 'Elija al menos una hora.').max(200),
});

export const returnTimeRequestSchema = z.strictObject({
  reason: requiredText(3, 500, 'Escriba qué debe corregir.'),
});

export const timeEntrySchema = z.object({
  id: z.uuid(),
  project: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
  item: z.object({ id: z.uuid(), number: z.number().int(), title: z.string() }).nullable(),
  person: personRefSchema,
  work_date: calendarDateSchema,
  hours: z.number(),
  billable: z.boolean(),
  note: z.string().nullable(),
  status: timeEntryStatusSchema,
  decision_note: z.string().nullable().describe('Por qué se devolvió'),
  decided_by: personRefSchema.nullable(),
  version: versionSchema,
});

export const timeListQuerySchema = z.strictObject({
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  status: timeEntryStatusSchema.optional(),
});

export const timeListResponseSchema = z.object({
  data: z.array(timeEntrySchema),
  total_hours: z.number(),
});

/** Para «Mis horas»: los proyectos donde la persona puede registrar y sus ítems abiertos. */
export const timeOptionsSchema = z.object({
  projects: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      items: z.array(z.object({ id: z.uuid(), number: z.number().int(), title: z.string() })),
    }),
  ),
  earliest_date: calendarDateSchema.describe('El día más antiguo que aún se puede registrar'),
  today: calendarDateSchema,
});

export type TimeEntryRequest = z.infer<typeof timeEntryRequestSchema>;
export type ApproveTimeRequest = z.infer<typeof approveTimeRequestSchema>;
export type ReturnTimeRequest = z.infer<typeof returnTimeRequestSchema>;
export type TimeEntry = z.infer<typeof timeEntrySchema>;
export type TimeListQuery = z.infer<typeof timeListQuerySchema>;
export type TimeListResponse = z.infer<typeof timeListResponseSchema>;
export type TimeOptions = z.infer<typeof timeOptionsSchema>;
