import { z } from 'zod';

import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';

// Riesgos y oportunidades (B38, decisión 9; FT-SGC-003). Probabilidad e impacto de 1 a 5; su
// producto da el nivel: bajo hasta 4, moderado hasta 9, alto hasta 16 y crítico desde 17. Escala
// por validar frente al formato FT-SGC-003.

export const QMS_RISK_KINDS = { risk: 'Riesgo', opportunity: 'Oportunidad' } as const;
export type QmsRiskKind = keyof typeof QMS_RISK_KINDS;
export const qmsRiskKindSchema = qmsEnumOf(QMS_RISK_KINDS);

export const QMS_RISK_LEVELS = {
  low: 'Bajo',
  moderate: 'Moderado',
  high: 'Alto',
  critical: 'Crítico',
} as const;
export type QmsRiskLevel = keyof typeof QMS_RISK_LEVELS;
export const qmsRiskLevelSchema = qmsEnumOf(QMS_RISK_LEVELS);

export const QMS_RISK_SCALE = {
  1: 'Muy bajo',
  2: 'Bajo',
  3: 'Medio',
  4: 'Alto',
  5: 'Muy alto',
} as const;

/** Un riesgo se acepta, se mitiga, se transfiere o se evita; una oportunidad se aprovecha. */
export const QMS_RISK_TREATMENTS = {
  accept: 'Aceptar',
  mitigate: 'Mitigar',
  transfer: 'Transferir',
  avoid: 'Evitar',
  exploit: 'Aprovechar',
} as const;
export type QmsRiskTreatment = keyof typeof QMS_RISK_TREATMENTS;
export const qmsRiskTreatmentSchema = qmsEnumOf(QMS_RISK_TREATMENTS);

export const QMS_RISK_STATUSES = { active: 'Vigente', retired: 'Retirado' } as const;
export const qmsRiskStatusSchema = qmsEnumOf(QMS_RISK_STATUSES);

export interface QmsRiskRating {
  readonly score: number;
  readonly level: QmsRiskLevel;
}

/** Valor = probabilidad × impacto y su nivel (decisión 9). */
export function rateRisk(probability: number, impact: number): QmsRiskRating {
  const score = probability * impact;
  const level: QmsRiskLevel =
    score <= 4 ? 'low' : score <= 9 ? 'moderate' : score <= 16 ? 'high' : 'critical';
  return { score, level };
}

const scaleSchema = z.number().int().min(1).max(5);

export const qmsRiskSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  kind: qmsRiskKindSchema,
  process: qmsRefSchema,
  description: z.string(),
  causes: z.string().nullable(),
  probability: z.number().int(),
  impact: z.number().int(),
  score: z.number().int(),
  level: qmsRiskLevelSchema,
  treatment: qmsRiskTreatmentSchema,
  treatment_plan: z.string().nullable(),
  owner: qmsRefSchema,
  review_on: qmsDateSchema,
  review_due: z.boolean(),
  status: qmsRiskStatusSchema,
  version: z.number().int().positive(),
});
export const qmsRiskListResponseSchema = z.object({ data: z.array(qmsRiskSchema) });

export const saveQmsRiskSchema = z
  .strictObject({
    kind: qmsRiskKindSchema,
    process_id: qmsIdSchema,
    description: qmsTextSchema(5, 1000).describe('Descripción del riesgo o la oportunidad'),
    causes: qmsOptionalText(1000),
    probability: scaleSchema.describe('Probabilidad de 1 (muy baja) a 5 (muy alta)'),
    impact: scaleSchema.describe('Impacto de 1 (muy bajo) a 5 (muy alto)'),
    treatment: qmsRiskTreatmentSchema,
    treatment_plan: qmsOptionalText(2000),
    owner_id: qmsIdSchema.describe('Cuenta de quien responde por el riesgo'),
    review_on: qmsDateSchema.describe('Fecha de la próxima revisión'),
    status: qmsRiskStatusSchema.default('active'),
  })
  .refine((input) => (input.kind === 'opportunity') === (input.treatment === 'exploit'), {
    path: ['treatment'],
    message: 'Una oportunidad se aprovecha; un riesgo se acepta, mitiga, transfiere o evita.',
  });

export type QmsRisk = z.infer<typeof qmsRiskSchema>;
export type SaveQmsRisk = z.infer<typeof saveQmsRiskSchema>;
