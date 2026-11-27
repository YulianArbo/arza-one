import { z } from 'zod';

import { ticketCategorySchema, ticketPrioritySchema } from '../service/common.js';
import { pqrsfTypeSchema } from '../service/pqrsf.js';
import {
  aiOutcomeSchema,
  aiProviderSchema,
  aiReviewSchema,
  aiSourceKindSchema,
  aiTargetUseCaseSchema,
  aiUseCaseSchema,
} from './common.js';

// Uso del asistente (B47): preguntas sobre los documentos, resúmenes, borradores y clasificaciones
// sugeridas. Toda respuesta cita sus fuentes y es solo una propuesta: la persona decide.

export const aiSearchRequestSchema = z.strictObject({
  question: z
    .string()
    .trim()
    .min(5, 'Escriba una pregunta de al menos cinco letras.')
    .max(500, 'Escriba una pregunta más corta (máximo 500 caracteres).'),
});

export const aiAssistRequestSchema = z.strictObject({
  use_case: aiTargetUseCaseSchema,
  target_id: z.uuid().describe('Documento, tiquete o PQRSF sobre el que se trabaja'),
});

/** Registro en que se basa la respuesta, con su enlace. */
export const aiSourceSchema = z.object({
  kind: aiSourceKindSchema,
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
});

/** Clasificación sugerida: la persona la revisa y la aplica en la pantalla del registro. */
export const aiSuggestionSchema = z.object({
  ticket_category: ticketCategorySchema.nullable(),
  ticket_priority: ticketPrioritySchema.nullable(),
  pqrsf_type: pqrsfTypeSchema.nullable(),
  reason: z.string().describe('Por qué la propone'),
});

export const aiAnswerSchema = z.object({
  request_id: z.uuid().describe('Uso registrado; con él la persona dice si usó la propuesta'),
  use_case: aiUseCaseSchema,
  outcome: aiOutcomeSchema,
  text: z.string().nullable().describe('Respuesta, resumen o borrador'),
  suggestion: aiSuggestionSchema.nullable(),
  sources: z.array(aiSourceSchema),
  model: z.string(),
  rehearsal: z.boolean().describe('Respuesta del modo de ensayo, sin inteligencia artificial'),
});

export const aiReviewRequestSchema = z.strictObject({ decision: aiReviewSchema });

/** Qué puede hacer hoy la persona con el asistente. */
export const aiStatusSchema = z.object({
  provider: aiProviderSchema,
  model: z.string().nullable(),
  enabled_use_cases: z.array(aiUseCaseSchema),
  used_today: z.number().int().nonnegative(),
  daily_limit: z.number().int().positive(),
});

export type AiSearchRequest = z.infer<typeof aiSearchRequestSchema>;
export type AiAssistRequest = z.infer<typeof aiAssistRequestSchema>;
export type AiSource = z.infer<typeof aiSourceSchema>;
export type AiSuggestion = z.infer<typeof aiSuggestionSchema>;
export type AiAnswer = z.infer<typeof aiAnswerSchema>;
export type AiReviewRequest = z.infer<typeof aiReviewRequestSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
