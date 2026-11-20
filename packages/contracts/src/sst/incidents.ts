import { z } from 'zod';

import {
  sstDateSchema,
  sstEnumOf,
  sstIdSchema,
  sstOptionalText,
  sstRefSchema,
  sstTextSchema,
} from './common.js';

// Reporte desde el celular, incidentes, accidentes e investigación (B37, decisiones 5, 6 y 10;
// ficha 17.14; FT-SST-003 y FT-SST-004). Cualquier colaborador reporta en tres datos: qué pasa,
// dónde y una foto opcional. Los actos y condiciones inseguras van a su propia lista; los
// incidentes y accidentes siguen el flujo reportado → en investigación → con plan de acción →
// cerrado. Un accidente se reporta a la ARL dentro de los dos días hábiles siguientes. Nunca se
// escriben diagnósticos.

export const QUICK_REPORT_KINDS = {
  unsafe_condition: 'Condición insegura',
  unsafe_act: 'Acto inseguro',
  incident: 'Incidente (casi pasa)',
  accident: 'Accidente (alguien se lesionó)',
} as const;
export type QuickReportKind = keyof typeof QUICK_REPORT_KINDS;
export const quickReportKindSchema = sstEnumOf(QUICK_REPORT_KINDS);

export const AFFECTED_PEOPLE = {
  self: 'Yo',
  other: 'Otra persona',
  none: 'Nadie',
} as const;
export const affectedSchema = sstEnumOf(AFFECTED_PEOPLE);

export const quickReportSchema = z
  .strictObject({
    kind: quickReportKindSchema,
    description: sstTextSchema(10, 1000).describe('Qué pasa o qué pasó, sin diagnósticos'),
    location: sstTextSchema(3, 200).describe('Dónde'),
    photo_file_id: sstIdSchema.nullable().default(null),
    occurred_at: z.iso.datetime({ offset: true }).nullable().default(null),
    affected: affectedSchema.default('none'),
  })
  .refine((input) => input.kind !== 'accident' || input.affected !== 'none', {
    path: ['affected'],
    message: 'En un accidente indique quién se lesionó.',
  });

export const quickReportResponseSchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  goes_to: z.enum(['unsafe_report', 'incident']),
});

export const UNSAFE_REPORT_STATUS = {
  reported: 'Reportado',
  in_progress: 'En atención',
  closed: 'Atendido',
} as const;
export const unsafeReportStatusSchema = sstEnumOf(UNSAFE_REPORT_STATUS);

export const unsafeReportSchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  kind: z.enum(['unsafe_condition', 'unsafe_act']),
  description: z.string(),
  location: z.string(),
  photo_file_id: sstIdSchema.nullable(),
  reported_by: sstRefSchema,
  reported_at: z.iso.datetime({ offset: true }),
  status: unsafeReportStatusSchema,
  response: z.string().nullable(),
  version: z.number().int().positive(),
});
export const unsafeReportListResponseSchema = z.object({ data: z.array(unsafeReportSchema) });

export const attendUnsafeReportSchema = z.strictObject({
  status: z.enum(['in_progress', 'closed']),
  response: sstTextSchema(5, 1000).describe('Qué se hizo o qué se hará'),
});

export const SST_INCIDENT_KINDS = {
  incident: 'Incidente de trabajo',
  accident: 'Accidente de trabajo',
} as const;
export const sstIncidentKindSchema = sstEnumOf(SST_INCIDENT_KINDS);

export const SST_INCIDENT_STATUS = {
  reported: 'Reportado',
  investigating: 'En investigación',
  action_plan: 'Con plan de acción',
  closed: 'Cerrado',
} as const;
export type SstIncidentStatus = keyof typeof SST_INCIDENT_STATUS;
export const sstIncidentStatusSchema = sstEnumOf(SST_INCIDENT_STATUS);

export const investigationActionSchema = z.object({
  id: sstIdSchema,
  description: z.string(),
  responsible: sstRefSchema,
  due_on: sstDateSchema,
  done_on: sstDateSchema.nullable(),
  note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const sstIncidentSummarySchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  kind: sstIncidentKindSchema,
  status: sstIncidentStatusSchema,
  occurred_at: z.iso.datetime({ offset: true }),
  location: z.string(),
  affected: affectedSchema,
  affected_employee: sstRefSchema.nullable(),
  reported_by: sstRefSchema,
  arl_due_on: sstDateSchema.nullable(),
  arl_reported_on: sstDateSchema.nullable(),
  arl_overdue: z.boolean(),
  version: z.number().int().positive(),
});
export const sstIncidentListResponseSchema = z.object({ data: z.array(sstIncidentSummarySchema) });

export const sstIncidentDetailSchema = sstIncidentSummarySchema.extend({
  description: z.string(),
  photo_file_id: sstIdSchema.nullable(),
  arl_filing_number: z.string().nullable(),
  team: z.string().nullable(),
  immediate_causes: z.string().nullable(),
  root_causes: z.string().nullable(),
  conclusion: z.string().nullable(),
  actions: z.array(investigationActionSchema),
});

export const reportToArlSchema = z.strictObject({
  reported_on: sstDateSchema.describe('Fecha en que se radicó el reporte ante la ARL'),
  filing_number: sstTextSchema(3, 60).describe('Número de radicado del FURAT'),
});

export const startInvestigationSchema = z.strictObject({
  team: sstTextSchema(3, 500).describe('Quiénes investigan (jefe, COPASST, SST)'),
  affected_employee_id: sstIdSchema.nullable().default(null),
});

export const investigationPlanSchema = z.strictObject({
  immediate_causes: sstTextSchema(10, 4000),
  root_causes: sstTextSchema(10, 4000).describe('Causas básicas o raíz'),
  actions: z
    .array(
      z.strictObject({
        description: sstTextSchema(5, 500),
        responsible_id: sstIdSchema,
        due_on: sstDateSchema,
      }),
    )
    .min(1, 'Registre al menos una acción.')
    .max(20),
});

export const completeInvestigationActionSchema = z.strictObject({
  done_on: sstDateSchema,
  note: sstOptionalText(1000),
});

export const closeIncidentSchema = z.strictObject({
  conclusion: sstTextSchema(10, 2000).describe('Conclusión y lecciones aprendidas'),
});

/** Lo que el colaborador ve de sus propios reportes: el estado, no el análisis. */
export const ownReportSchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  kind: quickReportKindSchema,
  location: z.string(),
  reported_at: z.iso.datetime({ offset: true }),
  status: z.string().describe('Etiqueta del estado en español'),
});

export type QuickReport = z.infer<typeof quickReportSchema>;
export type QuickReportResponse = z.infer<typeof quickReportResponseSchema>;
export type UnsafeReport = z.infer<typeof unsafeReportSchema>;
export type AttendUnsafeReport = z.infer<typeof attendUnsafeReportSchema>;
export type SstIncidentSummary = z.infer<typeof sstIncidentSummarySchema>;
export type SstIncidentDetail = z.infer<typeof sstIncidentDetailSchema>;
export type InvestigationAction = z.infer<typeof investigationActionSchema>;
export type ReportToArl = z.infer<typeof reportToArlSchema>;
export type StartInvestigation = z.infer<typeof startInvestigationSchema>;
export type InvestigationPlan = z.infer<typeof investigationPlanSchema>;
export type CompleteInvestigationAction = z.infer<typeof completeInvestigationActionSchema>;
export type CloseIncident = z.infer<typeof closeIncidentSchema>;
export type OwnReport = z.infer<typeof ownReportSchema>;
