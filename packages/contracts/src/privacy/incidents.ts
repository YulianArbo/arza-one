import { z } from 'zod';

import { dataCategorySchema } from './register.js';

// Incidentes de seguridad con datos personales (M18, B42; numeral 15.7 y Circular Única de la SIC,
// Título V). Se registran con su bitácora de medidas; el Oficial los reporta a la Superintendencia
// dentro de los quince días hábiles siguientes a la detección. Estados: abierto → contenido →
// reportado a la SIC → cerrado (decisión 9).

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');
const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

export const INCIDENT_RULES = {
  /** Días hábiles para reportar a la SIC desde la detección. */
  sicReportBusinessDays: 15,
  /** Aviso al Oficial cuando faltan estos días hábiles, y otro el día del vencimiento. */
  warnBusinessDaysBefore: 2,
} as const;

export const PRIVACY_INCIDENT_STATUSES = {
  open: 'Abierto',
  contained: 'Contenido',
  reported: 'Reportado a la SIC',
  closed: 'Cerrado',
} as const;

export type PrivacyIncidentStatus = keyof typeof PRIVACY_INCIDENT_STATUSES;

export const privacyIncidentStatusSchema = enumOf(PRIVACY_INCIDENT_STATUSES);

/** Qué paso admite cada estado. */
export const PRIVACY_INCIDENT_ACTIONS = {
  update: ['open', 'contained'],
  contain: ['open'],
  report: ['open', 'contained'],
  notify_holders: ['open', 'contained', 'reported'],
  add_measure: ['open', 'contained', 'reported'],
  close: ['open', 'contained', 'reported'],
} as const satisfies Record<string, readonly PrivacyIncidentStatus[]>;

export type PrivacyIncidentAction = keyof typeof PRIVACY_INCIDENT_ACTIONS;

export function canPrivacyIncidentStep(
  action: PrivacyIncidentAction,
  status: PrivacyIncidentStatus,
): boolean {
  const allowed: readonly PrivacyIncidentStatus[] = PRIVACY_INCIDENT_ACTIONS[action];
  return allowed.includes(status);
}

const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const categoriesSchema = z
  .array(dataCategorySchema)
  .min(1, 'Elija al menos un tipo de dato.')
  .max(10)
  .refine((values) => new Set(values).size === values.length, 'Hay opciones repetidas.');

const incidentFields = {
  title: textSchema(5, 200),
  description: textSchema(20, 8000).describe('Qué pasó, cómo se detectó y qué sistemas afectó'),
  detected_at: dateTime.describe('Cuándo se detectó; nunca posterior a ahora'),
  affected_count: z.number().int().min(0).max(100_000_000).describe('Titulares afectados'),
  data_categories: categoriesSchema,
  project_incident_ref: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .nullable()
    .default(null)
    .describe('Código del incidente en Proyectos, si lo hay'),
};

export const createPrivacyIncidentSchema = z.strictObject(incidentFields);

export type CreatePrivacyIncident = z.infer<typeof createPrivacyIncidentSchema>;

export const updatePrivacyIncidentSchema = z.strictObject(incidentFields);

export type UpdatePrivacyIncident = z.infer<typeof updatePrivacyIncidentSchema>;

export const privacyIncidentNoteSchema = z.strictObject({
  note: textSchema(5, 2000),
});

export type PrivacyIncidentNote = z.infer<typeof privacyIncidentNoteSchema>;

export const reportPrivacyIncidentSchema = z.strictObject({
  reported_on: calendarDate.describe('Día en que se reportó a la SIC; nunca posterior a hoy'),
  reference: textSchema(3, 80).describe('Radicado que entregó la SIC'),
});

export type ReportPrivacyIncident = z.infer<typeof reportPrivacyIncidentSchema>;

export const notifyHoldersSchema = z.strictObject({
  notified_on: calendarDate.describe('Día en que se informó a los titulares'),
  note: textSchema(5, 2000).describe('Cómo y a quiénes se informó'),
});

export type NotifyHolders = z.infer<typeof notifyHoldersSchema>;

export const addIncidentMeasureSchema = z.strictObject({
  description: textSchema(5, 2000).describe('La medida que se tomó'),
  taken_on: calendarDate.describe('Día en que se tomó; nunca posterior a hoy'),
});

export type AddIncidentMeasure = z.infer<typeof addIncidentMeasureSchema>;

/** Se cierra con el reporte a la SIC hecho o con el motivo por el que no se reporta (decisión 9). */
export const closePrivacyIncidentSchema = z.strictObject({
  not_reportable_reason: textSchema(10, 2000)
    .nullable()
    .default(null)
    .describe('Obligatorio si no se reportó a la SIC'),
});

export type ClosePrivacyIncident = z.infer<typeof closePrivacyIncidentSchema>;

export const privacyIncidentListQuerySchema = z.object({
  status: privacyIncidentStatusSchema.optional(),
});

export type PrivacyIncidentListQuery = z.infer<typeof privacyIncidentListQuerySchema>;

export const privacyIncidentSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  status: privacyIncidentStatusSchema,
  detected_at: dateTime,
  affected_count: z.number().int(),
  sensitive: z.boolean().describe('Comprometió datos sensibles'),
  sic_due_on: calendarDate.describe('Fecha límite para reportar a la SIC'),
  reported_on: calendarDate.nullable(),
  overdue: z.boolean().describe('Pasó la fecha límite sin reporte'),
  version: versionField,
});

export type PrivacyIncidentSummary = z.infer<typeof privacyIncidentSummarySchema>;

export const privacyIncidentListResponseSchema = z.object({
  data: z.array(privacyIncidentSummarySchema),
});

export type PrivacyIncidentListResponse = z.infer<typeof privacyIncidentListResponseSchema>;

export const incidentMeasureSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  taken_on: calendarDate,
  recorded_by: z.string().nullable(),
});

export type IncidentMeasure = z.infer<typeof incidentMeasureSchema>;

export const privacyIncidentSchema = privacyIncidentSummarySchema.extend({
  description: z.string(),
  data_categories: z.array(dataCategorySchema),
  project_incident_ref: z.string().nullable(),
  contained_at: dateTime.nullable(),
  containment_note: z.string().nullable(),
  sic_reference: z.string().nullable(),
  holders_notified_on: calendarDate.nullable(),
  holders_notice: z.string().nullable(),
  not_reportable_reason: z.string().nullable(),
  closed_at: dateTime.nullable(),
  measures: z.array(incidentMeasureSchema),
});

export type PrivacyIncident = z.infer<typeof privacyIncidentSchema>;
