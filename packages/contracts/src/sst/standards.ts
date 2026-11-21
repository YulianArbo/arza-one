import { z } from 'zod';

import { sstEnumOf, sstIdSchema, sstOptionalText, sstRefSchema } from './common.js';
import { MINIMUM_STANDARDS } from './standards-table.js';

// Autoevaluación de estándares mínimos (B37, decisión 4; Resolución 0312 de 2019, artículos 27 y
// 28; RE-SST-003). «Cumple» y «No aplica» con justificación suman el peso del estándar; «No cumple»
// y lo que aún no se evalúa suman 0. Menos de 60 es crítico; de 60 a 85, moderadamente aceptable;
// más de 85, aceptable.

export const STANDARD_RESULTS = {
  meets: 'Cumple totalmente',
  not_met: 'No cumple',
  not_applicable: 'No aplica (justificado)',
} as const;
export type StandardResult = keyof typeof STANDARD_RESULTS;
export const standardResultSchema = sstEnumOf(STANDARD_RESULTS);

export const STANDARD_RATINGS = {
  critical: 'Crítico',
  moderate: 'Moderadamente aceptable',
  acceptable: 'Aceptable',
} as const;
export type StandardRating = keyof typeof STANDARD_RATINGS;
export const standardRatingSchema = sstEnumOf(STANDARD_RATINGS);

const yearSchema = z.number().int().min(2020).max(2100);

export const standardItemSchema = z.object({
  code: z.string(),
  cycle: z.enum(['plan', 'do', 'check', 'act']),
  label: z.string(),
  weight: z.number().int().describe('Peso en centésimas de punto'),
  result: standardResultSchema.nullable(),
  justification: z.string().nullable(),
  evidence_file_id: sstIdSchema.nullable(),
  improvement: z.string().nullable(),
  assessed_by: sstRefSchema.nullable(),
  version: z.number().int().nonnegative().describe('0 si aún no se evalúa'),
});

export const standardsScoreSchema = z.object({
  year: yearSchema,
  score: z.number().int().describe('Puntaje en centésimas: 8550 = 85,50'),
  rating: standardRatingSchema,
  assessed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
});

export const standardsAssessmentSchema = z.object({
  year: yearSchema,
  score: standardsScoreSchema,
  data: z.array(standardItemSchema),
});

export const assessStandardSchema = z
  .strictObject({
    result: standardResultSchema,
    justification: sstOptionalText(1000),
    evidence_file_id: sstIdSchema.nullable().default(null),
    improvement: sstOptionalText(1000).describe('Acción de mejora cuando no cumple'),
  })
  .refine((input) => input.result !== 'not_applicable' || input.justification !== null, {
    path: ['justification'],
    message: 'Justifique por qué el estándar no aplica.',
  })
  .refine((input) => input.result !== 'not_met' || input.improvement !== null, {
    path: ['improvement'],
    message: 'Indique la acción de mejora del estándar que no se cumple.',
  });

/** Clasificación del puntaje (en centésimas) según el artículo 28. */
export function ratingOf(score: number): StandardRating {
  if (score < 6000) return 'critical';
  if (score <= 8500) return 'moderate';
  return 'acceptable';
}

/** Puntaje de la autoevaluación: suma el peso de lo que cumple o no aplica. */
export function scoreStandards(
  year: number,
  results: ReadonlyMap<string, StandardResult>,
): StandardsScore {
  let score = 0;
  for (const standard of MINIMUM_STANDARDS) {
    const result = results.get(standard.code);
    if (result === 'meets' || result === 'not_applicable') score += standard.weight;
  }
  return {
    year,
    score,
    rating: ratingOf(score),
    assessed: MINIMUM_STANDARDS.filter((standard) => results.has(standard.code)).length,
    total: MINIMUM_STANDARDS.length,
  };
}

export function isStandardCode(code: string): boolean {
  return MINIMUM_STANDARDS.some((standard) => standard.code === code);
}

export type StandardItem = z.infer<typeof standardItemSchema>;
export type StandardsScore = z.infer<typeof standardsScoreSchema>;
export type StandardsAssessment = z.infer<typeof standardsAssessmentSchema>;
export type AssessStandard = z.infer<typeof assessStandardSchema>;
