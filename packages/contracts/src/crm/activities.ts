import { z } from 'zod';

import { dateTimeSchema, listLimitSchema, personRefSchema, versionSchema } from './common.js';

// Actividades y recordatorios (ficha 17.6): llamadas, reuniones, tareas y correos de un prospecto o
// de una oportunidad. Su responsable recibe un aviso 30 minutos antes de la hora (B22).

export const ACTIVITY_TYPES = {
  call: 'Llamada',
  meeting: 'Reunión',
  task: 'Tarea',
  email: 'Correo',
} as const;

export type ActivityType = keyof typeof ACTIVITY_TYPES;

export const activityTypeSchema = z
  .enum(Object.keys(ACTIVITY_TYPES) as [ActivityType, ...ActivityType[]])
  .describe('Llamada, reunión, tarea o correo');

/** Minutos antes de la hora en que llega el recordatorio. */
export const ACTIVITY_REMINDER_MINUTES = 30;

const activityFields = {
  type: activityTypeSchema,
  subject: z.string().trim().min(3, 'Escriba al menos tres letras.').max(200),
  notes: z.string().trim().min(1).max(2000).nullable().default(null),
  due_at: dateTimeSchema.describe('Fecha y hora'),
  assignee_id: z.uuid().nullable().default(null).describe('Responsable; por defecto, quien crea'),
};

export const createCrmActivityRequestSchema = z
  .strictObject({
    lead_id: z.uuid().nullable().default(null),
    opportunity_id: z.uuid().nullable().default(null),
    ...activityFields,
  })
  .refine((activity) => (activity.lead_id === null) !== (activity.opportunity_id === null), {
    path: ['opportunity_id'],
    message: 'La actividad es de un prospecto o de una oportunidad.',
  });

export const updateCrmActivityRequestSchema = z.strictObject(activityFields);

export const completeCrmActivityRequestSchema = z.strictObject({
  outcome: z.string().trim().min(3, 'Escriba qué pasó.').max(2000).describe('Resultado'),
});

export const crmActivityRecordSchema = z.object({
  kind: z.enum(['lead', 'opportunity']),
  id: z.uuid(),
  code: z.string(),
  label: z.string().describe('Nombre del prospecto o título de la oportunidad'),
});

export const crmActivitySchema = z.object({
  id: z.uuid(),
  type: activityTypeSchema,
  subject: z.string(),
  notes: z.string().nullable(),
  due_at: dateTimeSchema,
  done_at: dateTimeSchema.nullable(),
  outcome: z.string().nullable(),
  assignee: personRefSchema.nullable(),
  record: crmActivityRecordSchema,
  version: versionSchema,
});

export const crmActivityListQuerySchema = z.strictObject({
  lead_id: z.uuid().optional(),
  opportunity_id: z.uuid().optional(),
  mine: z.enum(['true', 'false']).optional().describe('Solo las de la persona'),
  view: z.enum(['pending', 'done', 'all']).default('pending'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const crmActivityListResponseSchema = z.object({
  data: z.array(crmActivitySchema),
  next_cursor: z.uuid().nullable(),
});

export type CreateCrmActivityRequest = z.infer<typeof createCrmActivityRequestSchema>;
export type UpdateCrmActivityRequest = z.infer<typeof updateCrmActivityRequestSchema>;
export type CompleteCrmActivityRequest = z.infer<typeof completeCrmActivityRequestSchema>;
export type CrmActivity = z.infer<typeof crmActivitySchema>;
export type CrmActivityRecord = z.infer<typeof crmActivityRecordSchema>;
export type CrmActivityListQuery = z.infer<typeof crmActivityListQuerySchema>;
export type CrmActivityListResponse = z.infer<typeof crmActivityListResponseSchema>;
