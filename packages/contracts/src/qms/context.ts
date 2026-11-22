import { z } from 'zod';

import { qmsEnumOf, qmsIdSchema, qmsOptionalText, qmsTextSchema } from './common.js';

// Contexto de la organización (FT-DG-001, matriz DOFA-PESTEL) y partes interesadas (FT-DG-002)
// (B38, ficha 17.15).

export const CONTEXT_KINDS = {
  strength: 'Fortaleza',
  weakness: 'Debilidad',
  opportunity: 'Oportunidad',
  threat: 'Amenaza',
} as const;
export type ContextKind = keyof typeof CONTEXT_KINDS;
export const contextKindSchema = qmsEnumOf(CONTEXT_KINDS);

/** Factor PESTEL: solo para los factores externos (oportunidades y amenazas). */
export const PESTEL_FACTORS = {
  political: 'Político',
  economic: 'Económico',
  social: 'Social',
  technological: 'Tecnológico',
  environmental: 'Ecológico',
  legal: 'Legal',
} as const;
export type PestelFactor = keyof typeof PESTEL_FACTORS;
export const pestelFactorSchema = qmsEnumOf(PESTEL_FACTORS);

export const IMPACT_LEVELS = { high: 'Alto', medium: 'Medio', low: 'Bajo' } as const;
export const impactLevelSchema = qmsEnumOf(IMPACT_LEVELS);

const yearSchema = z.number().int().min(2020).max(2100);

export const contextItemSchema = z.object({
  id: qmsIdSchema,
  kind: contextKindSchema,
  pestel_factor: pestelFactorSchema.nullable(),
  description: z.string(),
  impact: impactLevelSchema,
  year: z.number().int(),
  version: z.number().int().positive(),
});
export const contextItemListResponseSchema = z.object({ data: z.array(contextItemSchema) });

export const contextQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export const saveContextItemSchema = z
  .strictObject({
    kind: contextKindSchema,
    pestel_factor: pestelFactorSchema.nullable().default(null),
    description: qmsTextSchema(5, 1000).describe('Descripción del factor'),
    impact: impactLevelSchema,
    year: yearSchema,
  })
  .refine(
    (input) =>
      input.pestel_factor === null || input.kind === 'opportunity' || input.kind === 'threat',
    {
      path: ['pestel_factor'],
      message: 'El factor PESTEL se indica solo en oportunidades y amenazas.',
    },
  );

export const STAKEHOLDER_TYPES = { internal: 'Interna', external: 'Externa' } as const;
export const stakeholderTypeSchema = qmsEnumOf(STAKEHOLDER_TYPES);

export const stakeholderSchema = z.object({
  id: qmsIdSchema,
  name: z.string(),
  stakeholder_type: stakeholderTypeSchema,
  needs: z.string(),
  expectations: z.string(),
  monitoring: z.string().nullable(),
  version: z.number().int().positive(),
});
export const stakeholderListResponseSchema = z.object({ data: z.array(stakeholderSchema) });

export const saveStakeholderSchema = z.strictObject({
  name: qmsTextSchema(2, 200).describe('Parte interesada'),
  stakeholder_type: stakeholderTypeSchema,
  needs: qmsTextSchema(3, 1000).describe('Necesidades'),
  expectations: qmsTextSchema(3, 1000).describe('Expectativas'),
  monitoring: qmsOptionalText(1000),
});

export type ContextItem = z.infer<typeof contextItemSchema>;
export type SaveContextItem = z.infer<typeof saveContextItemSchema>;
export type Stakeholder = z.infer<typeof stakeholderSchema>;
export type SaveStakeholder = z.infer<typeof saveStakeholderSchema>;
