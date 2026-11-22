import { z } from 'zod';

import { qmsActionSchema } from './actions.js';
import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';

// No conformidades y salidas no conformes (B38, ficha 17.15; FT-SGC-004). Flujo: detectada →
// contenida → en análisis → con plan → verificada → cerrada eficaz o reabierta. Toda no
// conformidad exige corrección inmediata, causa raíz y acciones con responsable y fecha. Se
// reportan a mano o nacen enlazadas a su origen: una queja o un reclamo procedente (decisión 4),
// un incidente de SST (decisión 5) y, desde B39, un hallazgo de auditoría.

export const NONCONFORMITY_SOURCES = {
  report: 'Reporte interno',
  pqrsf: 'Queja o reclamo procedente',
  sst_incident: 'Incidente de SST',
  audit: 'Auditoría interna',
} as const;
export type NonconformitySource = keyof typeof NONCONFORMITY_SOURCES;
export const nonconformitySourceSchema = qmsEnumOf(NONCONFORMITY_SOURCES);

/** Decisión 6. */
export const NONCONFORMITY_CLASSES = {
  nonconforming_output: 'Salida no conforme',
  minor: 'No conformidad menor',
  major: 'No conformidad mayor',
} as const;
export type NonconformityClass = keyof typeof NONCONFORMITY_CLASSES;
export const nonconformityClassSchema = qmsEnumOf(NONCONFORMITY_CLASSES);

export const NONCONFORMITY_STATUSES = {
  detected: 'Detectada',
  contained: 'Contenida',
  analyzing: 'En análisis',
  planned: 'Con plan',
  verified: 'Verificada',
  closed: 'Cerrada eficaz',
  reopened: 'Reabierta',
} as const;
export type NonconformityStatus = keyof typeof NONCONFORMITY_STATUSES;
export const nonconformityStatusSchema = qmsEnumOf(NONCONFORMITY_STATUSES);

export type NonconformityStep = 'contain' | 'analyze' | 'plan' | 'close' | 'reopen';

/** Estados desde los que se da cada paso; «verificada» llega sola al verificar la última acción. */
const STEP_FROM: Readonly<Record<NonconformityStep, readonly NonconformityStatus[]>> = {
  contain: ['detected'],
  analyze: ['contained', 'analyzing', 'reopened'],
  plan: ['analyzing'],
  close: ['verified'],
  reopen: ['verified'],
};

export function canNonconformityStep(
  step: NonconformityStep,
  status: NonconformityStatus,
): boolean {
  return STEP_FROM[step].includes(status);
}

/** Estados en los que se le pueden agregar acciones. */
export const ACCEPTS_ACTIONS: readonly NonconformityStatus[] = ['analyzing', 'planned', 'reopened'];

/** Análisis de causa (decisión 7): «5 porqués» o espina de pescado con las 6M. */
export const ANALYSIS_METHODS = {
  five_whys: 'Cinco porqués',
  ishikawa: 'Espina de pescado (6M)',
} as const;
export const analysisMethodSchema = qmsEnumOf(ANALYSIS_METHODS);

export const ISHIKAWA_CATEGORIES = {
  method: 'Método',
  machine: 'Máquina',
  materials: 'Materiales',
  manpower: 'Mano de obra',
  measurement: 'Medición',
  environment: 'Medio ambiente',
} as const;
export type IshikawaCategory = keyof typeof ISHIKAWA_CATEGORIES;

const causeSchema = qmsTextSchema(3, 300);
const causesSchema = z.array(causeSchema).max(10).default([]);

export const ishikawaSchema = z
  .strictObject({
    method: causesSchema,
    machine: causesSchema,
    materials: causesSchema,
    manpower: causesSchema,
    measurement: causesSchema,
    environment: causesSchema,
  })
  .refine((causes) => Object.values(causes).some((list) => list.length > 0), {
    message: 'Indique al menos una causa en alguna de las 6M.',
  });

export const analysisSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('five_whys'), whys: z.array(causeSchema).min(1).max(5) }),
  z.strictObject({ method: z.literal('ishikawa'), causes: ishikawaSchema }),
]);

export const analyzeNonconformitySchema = z.strictObject({
  analysis: analysisSchema,
  root_cause: qmsTextSchema(5, 1000).describe('Causa raíz (obligatoria)'),
});

export const reportNonconformitySchema = z.strictObject({
  description: qmsTextSchema(10, 2000).describe('Qué se detectó'),
  process_id: qmsIdSchema.nullable().default(null),
  detected_on: qmsDateSchema,
  sst_incident_id: qmsIdSchema
    .nullable()
    .default(null)
    .describe('Incidente de SST que la origina (solo quien gestiona no conformidades)'),
});

export const containNonconformitySchema = z.strictObject({
  classification: nonconformityClassSchema,
  process_id: qmsIdSchema,
  containment: qmsTextSchema(5, 2000).describe('Corrección inmediata'),
  contained_on: qmsDateSchema,
});

export const closeNonconformitySchema = z.strictObject({ note: qmsOptionalText(1000) });
export const reopenNonconformitySchema = z.strictObject({
  reason: qmsTextSchema(5, 1000).describe('Por qué no fue eficaz'),
});

export const nonconformityOriginSchema = z.object({
  type: nonconformitySourceSchema,
  id: qmsIdSchema,
  code: z.string(),
});

export const nonconformitySummarySchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  source: nonconformitySourceSchema,
  origin: nonconformityOriginSchema.nullable(),
  process: qmsRefSchema.nullable(),
  description: z.string(),
  classification: nonconformityClassSchema.nullable(),
  status: nonconformityStatusSchema,
  detected_on: qmsDateSchema,
  reported_by: qmsRefSchema,
  version: z.number().int().positive(),
});
export const nonconformityListResponseSchema = z.object({
  data: z.array(nonconformitySummarySchema),
});

export const nonconformityQuerySchema = z.strictObject({
  status: nonconformityStatusSchema.optional(),
});

export const nonconformitySchema = nonconformitySummarySchema.extend({
  containment: z.string().nullable(),
  contained_on: qmsDateSchema.nullable(),
  analysis: analysisSchema.nullable(),
  root_cause: z.string().nullable(),
  close_note: z.string().nullable(),
  reopen_reason: z.string().nullable(),
  closed_on: qmsDateSchema.nullable(),
});

/** El detalle de una no conformidad con sus acciones. */
export const nonconformityDetailResponseSchema = z.object({
  nonconformity: nonconformitySchema,
  actions: z.array(qmsActionSchema),
});

export type NonconformityDetailResponse = z.infer<typeof nonconformityDetailResponseSchema>;
export type NonconformitySummary = z.infer<typeof nonconformitySummarySchema>;
export type Nonconformity = z.infer<typeof nonconformitySchema>;
export type NonconformityAnalysis = z.infer<typeof analysisSchema>;
export type ReportNonconformity = z.infer<typeof reportNonconformitySchema>;
export type ContainNonconformity = z.infer<typeof containNonconformitySchema>;
export type AnalyzeNonconformity = z.infer<typeof analyzeNonconformitySchema>;
export type CloseNonconformity = z.infer<typeof closeNonconformitySchema>;
export type ReopenNonconformity = z.infer<typeof reopenNonconformitySchema>;
