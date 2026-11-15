import { z } from 'zod';

import { optionalText, requiredText } from '../contract/common.js';
import {
  calendarDateSchema,
  dateTimeSchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';

// Encuestas de satisfacción y NPS (B29, ficha 17.9, FT-SAC-003). Al resolver un tiquete, quien lo
// pidió recibe por correo un enlace personal a una encuesta corta: qué tan probable es que nos
// recomiende (de 0 a 10), qué tan satisfecho quedó (de 1 a 5) y un comentario (decisión 9).

export const SURVEY_RULES = {
  /** Días que vale el enlace de la encuesta (decisión 8). */
  linkDays: 30,
  /** Días que cubre el informe si no se elige el periodo. */
  defaultReportDays: 90,
} as const;

/** Encuestas que existen y cuándo salen. Hoy solo la de tiquete resuelto. */
export const SURVEY_TRIGGERS = { ticket_resolved: 'Al resolver un tiquete' } as const;

export type SurveyTrigger = keyof typeof SURVEY_TRIGGERS;

export const surveyTriggerSchema = z.enum(['ticket_resolved']);

/** Textos de la encuesta con que nace cada empresa. */
export const DEFAULT_SURVEY = {
  key: 'ticket_resolution',
  name: 'Satisfacción con la atención',
  recommend_question:
    'Del 0 al 10, ¿qué tan probable es que nos recomiende a un colega o a otra empresa?',
  satisfaction_question: 'Del 1 al 5, ¿qué tan satisfecho quedó con la solución que le dimos?',
  comment_question: '¿Quiere contarnos algo más? (opcional)',
} as const;

/**
 * NPS: porcentaje de quienes calificaron 9 o 10 menos el de quienes calificaron de 0 a 6, redondeado
 * a entero. Sin respuestas no hay NPS.
 */
export function npsOf(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((score) => score >= 9).length;
  const detractors = scores.filter((score) => score <= 6).length;
  return Math.round(((promoters - detractors) * 100) / scores.length);
}

const questionSchema = (message: string) => requiredText(5, 300, message);

export const surveySchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  trigger: surveyTriggerSchema,
  recommend_question: z.string(),
  satisfaction_question: z.string(),
  comment_question: z.string(),
  is_active: z.boolean().describe('Si está apagada, no se envía'),
  version: versionSchema,
});

export const surveyListResponseSchema = z.object({
  data: z.array(surveySchema),
  can_manage: z.boolean(),
});

export const updateSurveyRequestSchema = z.strictObject({
  name: requiredText(3, 120, 'Escriba el nombre de la encuesta.'),
  recommend_question: questionSchema('Escriba la pregunta de recomendación (de 0 a 10).'),
  satisfaction_question: questionSchema('Escriba la pregunta de satisfacción (de 1 a 5).'),
  comment_question: questionSchema('Escriba la invitación a comentar.'),
  is_active: z.boolean(),
});

export const surveyResultsQuerySchema = z
  .strictObject({
    from: calendarDateSchema.optional().describe('Desde (respondidas); por omisión, 90 días atrás'),
    to: calendarDateSchema.optional().describe('Hasta; por omisión, hoy'),
  })
  .refine((value) => value.from === undefined || value.to === undefined || value.from <= value.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });

export const surveyAnswerSchema = z.object({
  id: z.uuid(),
  ticket: z.object({ id: z.uuid(), code: z.string() }),
  party: personRefSchema.nullable().describe('Cliente'),
  score: z.number().int().describe('Recomendación, de 0 a 10'),
  satisfaction: z.number().int().describe('Satisfacción, de 1 a 5'),
  comment: z.string().nullable(),
  answered_at: dateTimeSchema,
});

export const surveyResultsSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  summary: z.object({
    sent: z.number().int().describe('Encuestas enviadas en el periodo'),
    answered: z.number().int().describe('Respondidas en el periodo'),
    nps: z.number().int().nullable().describe('De -100 a 100; vacío si nadie respondió'),
    promoters: z.number().int().describe('Calificaron 9 o 10'),
    passives: z.number().int().describe('Calificaron 7 u 8'),
    detractors: z.number().int().describe('Calificaron de 0 a 6'),
    satisfaction_avg: z.number().nullable().describe('Promedio de 1 a 5, con un decimal'),
  }),
  data: z.array(surveyAnswerSchema).describe('Las respuestas, de la más reciente a la más antigua'),
});

/** La encuesta de un tiquete, en su ficha. */
export const TICKET_SURVEY_STATES = {
  no_recipient: 'Sin correo para enviarla',
  sent: 'Enviada, sin responder',
  answered: 'Respondida',
  expired: 'Venció sin respuesta',
} as const;

export type TicketSurveyState = keyof typeof TICKET_SURVEY_STATES;

export const ticketSurveySchema = z.object({
  state: z.enum(Object.keys(TICKET_SURVEY_STATES) as [TicketSurveyState, ...TicketSurveyState[]]),
  score: z.number().int().nullable(),
  satisfaction: z.number().int().nullable(),
});

// Página pública de la encuesta ------------------------------------------------------------------

/** La llave del enlace va en el cuerpo, nunca en la dirección: así no queda en los registros. */
export const publicSurveyRequestSchema = z.strictObject({
  token: z.string().trim().min(20).max(200).describe('Llave del enlace del correo'),
});

export const publicSurveySchema = z.object({
  state: z.enum(['open', 'answered', 'expired']),
  company: z.string().describe('Empresa que pregunta'),
  ticket_code: z.string(),
  ticket_subject: z.string(),
  recommend_question: z.string(),
  satisfaction_question: z.string(),
  comment_question: z.string(),
});

export const publicSurveyAnswerRequestSchema = z.strictObject({
  token: z.string().trim().min(20).max(200),
  score: z.number().int().min(0, 'Elija de 0 a 10.').max(10, 'Elija de 0 a 10.'),
  satisfaction: z.number().int().min(1, 'Elija de 1 a 5.').max(5, 'Elija de 1 a 5.'),
  comment: optionalText(2000).describe('Comentario'),
});

export type Survey = z.infer<typeof surveySchema>;
export type SurveyListResponse = z.infer<typeof surveyListResponseSchema>;
export type UpdateSurveyRequest = z.infer<typeof updateSurveyRequestSchema>;
export type SurveyResultsQuery = z.infer<typeof surveyResultsQuerySchema>;
export type SurveyAnswer = z.infer<typeof surveyAnswerSchema>;
export type SurveyResults = z.infer<typeof surveyResultsSchema>;
export type TicketSurvey = z.infer<typeof ticketSurveySchema>;
export type PublicSurveyRequest = z.infer<typeof publicSurveyRequestSchema>;
export type PublicSurvey = z.infer<typeof publicSurveySchema>;
export type PublicSurveyAnswerRequest = z.infer<typeof publicSurveyAnswerRequestSchema>;
