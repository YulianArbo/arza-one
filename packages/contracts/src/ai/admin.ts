import { z } from 'zod';

import {
  aiInputClassSchema,
  aiOutcomeSchema,
  aiProviderSchema,
  aiRefSchema,
  aiReviewSchema,
  aiSourceKindSchema,
  aiUseCaseSchema,
} from './common.js';

// Gobierno del asistente (B47): activación de cada uso con su evaluación de impacto (decisión 7),
// instrucciones con versiones aprobadas por otra persona y registro de usos (decisión 5).

// Usos ------------------------------------------------------------------------------------------

export const aiUseCaseSettingSchema = z.object({
  use_case: aiUseCaseSchema,
  enabled: z.boolean(),
  assessment_reference: z
    .string()
    .nullable()
    .describe('Código o nombre de la evaluación de impacto'),
  assessment_approved_on: z.iso.date().nullable().describe('Fecha de aprobación de la evaluación'),
  changed_by: aiRefSchema.nullable(),
  changed_at: z.iso.datetime().nullable(),
  version: z.number().int().nonnegative().describe('0 si nunca se ha configurado'),
});

export const aiUseCaseListResponseSchema = z.object({ data: z.array(aiUseCaseSettingSchema) });

export const saveAiUseCaseSchema = z
  .strictObject({
    enabled: z.boolean(),
    assessment_reference: z
      .string()
      .trim()
      .min(3, 'Escriba el código o nombre de la evaluación de impacto.')
      .max(160)
      .nullable()
      .default(null),
    assessment_approved_on: z.iso.date().nullable().default(null),
    version: z.number().int().nonnegative().describe('Versión que se leyó (0 si es nueva)'),
  })
  .refine(
    (value) =>
      !value.enabled ||
      (value.assessment_reference !== null && value.assessment_approved_on !== null),
    {
      path: ['assessment_reference'],
      message: 'Para activar un uso registre la evaluación de impacto aprobada y su fecha.',
    },
  );

// Instrucciones ---------------------------------------------------------------------------------

export const AI_PROMPT_STATUSES = {
  draft: 'Borrador',
  approved: 'Aprobada',
  retired: 'Reemplazada',
} as const;

export type AiPromptStatus = keyof typeof AI_PROMPT_STATUSES;
export const aiPromptStatusSchema = z.enum(['draft', 'approved', 'retired']);

export const aiPromptSchema = z.object({
  id: z.uuid(),
  use_case: aiUseCaseSchema,
  version: z.number().int().positive(),
  body: z.string(),
  status: aiPromptStatusSchema,
  created_by: aiRefSchema.nullable(),
  created_at: z.iso.datetime(),
  approved_by: aiRefSchema.nullable(),
  approved_at: z.iso.datetime().nullable(),
});

export const aiPromptListResponseSchema = z.object({
  data: z.array(aiPromptSchema),
  defaults: z
    .array(z.object({ use_case: aiUseCaseSchema, body: z.string() }))
    .describe('Instrucción de fábrica de cada uso, que rige mientras no haya una aprobada'),
});

export const createAiPromptSchema = z.strictObject({
  use_case: aiUseCaseSchema,
  body: z
    .string()
    .trim()
    .min(20, 'Escriba la instrucción (al menos 20 caracteres).')
    .max(4000, 'La instrucción no puede pasar de 4.000 caracteres.'),
});

// Registro de usos ------------------------------------------------------------------------------

export const aiRequestRowSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime(),
  user: aiRefSchema.nullable(),
  use_case: aiUseCaseSchema,
  provider: aiProviderSchema,
  model: z.string(),
  prompt_version: z.number().int().nonnegative().describe('0: instrucción de fábrica'),
  input_class: aiInputClassSchema,
  input_chars: z.number().int().nonnegative(),
  output_chars: z.number().int().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  redactions: z.number().int().nonnegative().describe('Datos personales borrados antes de enviar'),
  outcome: aiOutcomeSchema,
  target: z.object({ kind: aiSourceKindSchema, id: z.uuid() }).nullable(),
  sources: z.array(z.object({ kind: aiSourceKindSchema, id: z.uuid() })),
  review: aiReviewSchema.nullable(),
  reviewed_at: z.iso.datetime().nullable(),
});

export const aiRequestListQuerySchema = z.strictObject({
  use_case: aiUseCaseSchema.optional(),
  outcome: aiOutcomeSchema.optional(),
  from: z.iso.date().optional().describe('Desde este día (hora de Bogotá)'),
  to: z.iso.date().optional().describe('Hasta este día, incluido (hora de Bogotá)'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});

export const aiRequestListResponseSchema = z.object({
  data: z.array(aiRequestRowSchema),
  next_cursor: z.uuid().nullable(),
});

export type AiUseCaseSetting = z.infer<typeof aiUseCaseSettingSchema>;
export type SaveAiUseCase = z.infer<typeof saveAiUseCaseSchema>;
export type AiPrompt = z.infer<typeof aiPromptSchema>;
export type AiPromptListResponse = z.infer<typeof aiPromptListResponseSchema>;
export type CreateAiPrompt = z.infer<typeof createAiPromptSchema>;
export type AiRequestRow = z.infer<typeof aiRequestRowSchema>;
export type AiRequestListQuery = z.infer<typeof aiRequestListQuerySchema>;
export type AiRequestListResponse = z.infer<typeof aiRequestListResponseSchema>;
