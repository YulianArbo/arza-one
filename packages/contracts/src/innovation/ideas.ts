import { z } from 'zod';

import {
  innDateSchema,
  innEnumOf,
  innIdSchema,
  innOptionalText,
  innRefSchema,
  innTextSchema,
} from './common.js';

// Banco de ideas (B40, ficha 17.16; FT-INN-005). Estados: inscrita → en evaluación → aprobada →
// en desarrollo → implementada, o archivada. La viabilidad se evalúa con el FT-INN-003 (decisión 4):
// cinco criterios de 1 a 5 y un concepto. Campos por validar frente al formato original.

export const IDEA_STAGES = {
  registered: 'Inscrita',
  evaluating: 'En evaluación',
  approved: 'Aprobada',
  in_development: 'En desarrollo',
  implemented: 'Implementada',
  archived: 'Archivada',
} as const;
export type IdeaStage = keyof typeof IDEA_STAGES;
export const ideaStageSchema = innEnumOf(IDEA_STAGES).describe('Estado de la idea');

/** Estados en los que la idea todavía se puede archivar. */
export const ARCHIVABLE_STAGES: readonly IdeaStage[] = [
  'registered',
  'evaluating',
  'approved',
  'in_development',
];

export const VIABILITY_CRITERIA = {
  market: 'Mercado o necesidad',
  technical: 'Viabilidad técnica',
  strategic: 'Alineación con la estrategia',
  cost_benefit: 'Costo frente a beneficio',
  risk: 'Riesgos (5 = riesgo bajo)',
} as const;
export type ViabilityCriterion = keyof typeof VIABILITY_CRITERIA;

export const VIABILITY_CONCEPTS = {
  viable: 'Viable',
  viable_with_adjustments: 'Viable con ajustes',
  not_viable: 'No viable',
} as const;
export type ViabilityConcept = keyof typeof VIABILITY_CONCEPTS;
export const viabilityConceptSchema = innEnumOf(VIABILITY_CONCEPTS).describe('Concepto final');

const scoreSchema = z.number().int().min(1).max(5);

export const viabilityScoresSchema = z.strictObject({
  market: scoreSchema.describe('Mercado o necesidad, de 1 a 5'),
  technical: scoreSchema.describe('Viabilidad técnica, de 1 a 5'),
  strategic: scoreSchema.describe('Alineación con la estrategia, de 1 a 5'),
  cost_benefit: scoreSchema.describe('Costo frente a beneficio, de 1 a 5'),
  risk: scoreSchema.describe('Riesgos, de 1 (alto) a 5 (bajo)'),
});
export type ViabilityScores = z.infer<typeof viabilityScoresSchema>;

/** Puntaje total: la suma de los cinco criterios (de 5 a 25). */
export function viabilityTotal(scores: ViabilityScores): number {
  return scores.market + scores.technical + scores.strategic + scores.cost_benefit + scores.risk;
}

export const viabilitySchema = z.object({
  scores: viabilityScoresSchema,
  total: z.number().int(),
  concept: viabilityConceptSchema,
  observations: z.string().nullable(),
  evaluated_by: innRefSchema,
  evaluated_on: innDateSchema,
  record_code: z.string().nullable().describe('Código del registro FT-INN-003'),
});

export const ideaSchema = z.object({
  id: innIdSchema,
  code: z.string(),
  title: z.string(),
  description: z.string(),
  expected_benefit: z.string().nullable(),
  stage: ideaStageSchema,
  proposer: innRefSchema,
  proposed_on: innDateSchema,
  evaluator: innRefSchema.nullable(),
  viability: viabilitySchema.nullable(),
  decision_note: z.string().nullable(),
  decided_by: innRefSchema.nullable(),
  decided_on: innDateSchema.nullable(),
  version: z.number().int().positive(),
});
export const ideaListResponseSchema = z.object({ data: z.array(ideaSchema) });
export const ideaQuerySchema = z.strictObject({ stage: ideaStageSchema.optional() });

export const saveIdeaSchema = z.strictObject({
  title: innTextSchema(5, 160).describe('Nombre corto de la idea'),
  description: innTextSchema(10, 4000).describe('Qué problema resuelve y qué propone'),
  expected_benefit: innOptionalText(2000),
});

export const submitViabilitySchema = z.strictObject({
  scores: viabilityScoresSchema,
  concept: viabilityConceptSchema,
  observations: innOptionalText(4000),
});

export const IDEA_DECISIONS = { approve: 'Aprobar', archive: 'Archivar' } as const;
export const ideaDecisionSchema = z.strictObject({
  decision: innEnumOf(IDEA_DECISIONS),
  note: innTextSchema(5, 2000).describe('Por qué se aprueba o se archiva'),
});

export const IDEA_PROGRESS = {
  in_development: 'En desarrollo',
  implemented: 'Implementada',
} as const;
export const ideaProgressSchema = z.strictObject({
  stage: innEnumOf(IDEA_PROGRESS),
  note: innOptionalText(2000),
});

export type Idea = z.infer<typeof ideaSchema>;
export type IdeaViability = z.infer<typeof viabilitySchema>;
export type SaveIdea = z.infer<typeof saveIdeaSchema>;
export type SubmitViability = z.infer<typeof submitViabilitySchema>;
export type IdeaDecision = z.infer<typeof ideaDecisionSchema>;
export type IdeaProgress = z.infer<typeof ideaProgressSchema>;
