import { z } from 'zod';

import { codeRefSchema } from './audits.js';
import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';

// Revisión por la dirección (B39; RE-SGC-007). Calidad prepara el acta y precarga las entradas que
// la plataforma ya conoce (ISO 9001, 9.3.2); lo que no conoce se escribe a mano. Cada decisión
// lleva responsable y fecha y se vuelve una acción de mejora al aprobarse. Solo la Dirección
// aprueba (decisión 5); el acta aprobada no cambia y queda en PDF (decisión 9).

export const REVIEW_STATUSES = {
  draft: 'En preparación',
  submitted: 'Por aprobar',
  approved: 'Aprobada',
} as const;
export type QmsReviewStatus = keyof typeof REVIEW_STATUSES;
export const qmsReviewStatusSchema = qmsEnumOf(REVIEW_STATUSES);

/** Las entradas del acta, en el orden de la norma; las «manuales» no las conoce la plataforma. */
export const REVIEW_INPUTS = {
  previous_actions: { title: 'Acciones de revisiones anteriores', manual: false },
  context: { title: 'Cambios en el contexto (DOFA-PESTEL)', manual: false },
  customer: { title: 'Satisfacción del cliente y PQRSF', manual: false },
  indicators: { title: 'Desempeño de los procesos (indicadores)', manual: false },
  nonconformities: { title: 'No conformidades y acciones correctivas', manual: false },
  audits: { title: 'Resultados de las auditorías', manual: false },
  risks: { title: 'Riesgos y oportunidades altos o críticos', manual: false },
  suppliers: { title: 'Desempeño de los proveedores externos', manual: true },
  resources: { title: 'Adecuación de los recursos', manual: true },
  improvement: { title: 'Oportunidades de mejora', manual: true },
} as const;
export type ReviewInputKey = keyof typeof REVIEW_INPUTS;
export const reviewInputKeySchema = z.enum(
  Object.keys(REVIEW_INPUTS) as [ReviewInputKey, ...ReviewInputKey[]],
);
export const REVIEW_INPUT_KEYS = Object.keys(REVIEW_INPUTS) as ReviewInputKey[];

export const reviewInputSchema = z.object({
  key: reviewInputKeySchema,
  title: z.string(),
  /** Lo que la plataforma precargó (vacío en las entradas manuales). */
  lines: z.array(z.string()),
  comment: z.string().nullable(),
});

export const reviewDecisionSchema = z.object({
  description: z.string(),
  responsible: qmsRefSchema,
  due_on: qmsDateSchema,
  action: codeRefSchema.nullable(),
});

export const managementReviewSummarySchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  period_from: qmsDateSchema,
  period_to: qmsDateSchema,
  meeting_on: qmsDateSchema,
  status: qmsReviewStatusSchema,
  version: z.number().int().positive(),
});
export const managementReviewListResponseSchema = z.object({
  data: z.array(managementReviewSummarySchema),
});

export const managementReviewSchema = managementReviewSummarySchema.extend({
  attendees: z.string(),
  inputs: z.array(reviewInputSchema),
  inputs_loaded_at: z.string().nullable(),
  conclusions: z.string().nullable(),
  decisions: z.array(reviewDecisionSchema),
  return_reason: z.string().nullable(),
  approved_by: qmsRefSchema.nullable(),
  approved_on: qmsDateSchema.nullable(),
  document_id: qmsIdSchema.nullable(),
});

export const createManagementReviewSchema = z
  .strictObject({
    period_from: qmsDateSchema.describe('Inicio del periodo que se revisa'),
    period_to: qmsDateSchema.describe('Fin del periodo que se revisa'),
    meeting_on: qmsDateSchema.describe('Fecha de la reunión'),
    attendees: qmsTextSchema(3, 1000).describe('Asistentes y cargos'),
  })
  .refine((input) => input.period_from <= input.period_to, {
    path: ['period_to'],
    message: 'El fin del periodo no puede ser anterior a su inicio.',
  });

export const saveReviewDecisionSchema = z.strictObject({
  description: qmsTextSchema(5, 1000),
  responsible_id: qmsIdSchema,
  due_on: qmsDateSchema,
});

export const updateManagementReviewSchema = z.strictObject({
  attendees: qmsTextSchema(3, 1000),
  comments: z
    .array(z.strictObject({ key: reviewInputKeySchema, comment: qmsOptionalText(4000) }))
    .max(REVIEW_INPUT_KEYS.length)
    .default([]),
  conclusions: qmsOptionalText(4000).describe('Conveniencia, adecuación y eficacia del sistema'),
  decisions: z.array(saveReviewDecisionSchema).max(40).default([]),
});

export const returnManagementReviewSchema = z.strictObject({
  reason: qmsTextSchema(5, 1000),
});

export type ManagementReviewSummary = z.infer<typeof managementReviewSummarySchema>;
export type ManagementReview = z.infer<typeof managementReviewSchema>;
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type CreateManagementReview = z.infer<typeof createManagementReviewSchema>;
export type UpdateManagementReview = z.infer<typeof updateManagementReviewSchema>;
export type ReturnManagementReview = z.infer<typeof returnManagementReviewSchema>;
