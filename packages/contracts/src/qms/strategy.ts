import { z } from 'zod';

import { qmsEnumOf, qmsIdSchema, qmsOptionalText, qmsTextSchema } from './common.js';

// Objetivos del plan estratégico (PL-DG-001) para el cuadro de mando integral (B46, decisión 4).
// Cada objetivo pertenece a una de las cuatro perspectivas y se mide con indicadores de Calidad.

export const SCORECARD_PERSPECTIVES = {
  financial: 'Financiera',
  customer: 'Clientes',
  internal: 'Procesos internos',
  learning: 'Aprendizaje y crecimiento',
} as const;
export type ScorecardPerspective = keyof typeof SCORECARD_PERSPECTIVES;
export const scorecardPerspectiveSchema = qmsEnumOf(SCORECARD_PERSPECTIVES).describe('Perspectiva');

const yearSchema = z.number().int().min(2020).max(2100);

export const strategicObjectiveSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  perspective: scorecardPerspectiveSchema,
  name: z.string(),
  description: z.string().nullable(),
  year_from: yearSchema,
  year_to: yearSchema,
  active: z.boolean(),
  indicator_ids: z.array(qmsIdSchema),
  version: z.number().int().positive(),
});
export const strategicObjectiveListResponseSchema = z.object({
  data: z.array(strategicObjectiveSchema),
});

export const saveStrategicObjectiveSchema = z
  .strictObject({
    perspective: scorecardPerspectiveSchema,
    name: qmsTextSchema(5, 200).describe('Objetivo'),
    description: qmsOptionalText(2000),
    year_from: yearSchema.describe('Año en que empieza'),
    year_to: yearSchema.describe('Año en que termina'),
    active: z.boolean().default(true),
  })
  .refine((input) => input.year_to >= input.year_from, {
    path: ['year_to'],
    message: 'El año final no puede ser anterior al inicial.',
  });

/** Los indicadores que miden el objetivo; reemplaza la lista anterior. */
export const linkObjectiveIndicatorsSchema = z.strictObject({
  indicator_ids: z.array(qmsIdSchema).max(30),
});

export type StrategicObjective = z.infer<typeof strategicObjectiveSchema>;
export type SaveStrategicObjective = z.infer<typeof saveStrategicObjectiveSchema>;
export type LinkObjectiveIndicators = z.infer<typeof linkObjectiveIndicatorsSchema>;
