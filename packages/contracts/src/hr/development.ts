import { z } from 'zod';

import { hrRefSchema } from './selection.js';

// Evaluación de desempeño, formación y bienestar (B36, ficha 17.13, decisión 7). Talento humano o
// el jefe inmediato fija los objetivos con su peso; el jefe califica de 1 a 5 y el colaborador
// acepta la evaluación desde «Mi espacio». La formación agrupa capacitaciones, inducciones y
// actividades de bienestar, con la asistencia y la calificación de cada persona.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

export const PERFORMANCE_REVIEW_STATUS = {
  draft: 'Objetivos fijados',
  scored: 'Calificada',
  agreed: 'Aceptada',
} as const;
export type PerformanceReviewStatus = keyof typeof PERFORMANCE_REVIEW_STATUS;
export const performanceReviewStatusSchema = enumOf(PERFORMANCE_REVIEW_STATUS);

/** Calificación de 1 (no cumple) a 5 (supera lo esperado). */
export const reviewScoreSchema = z
  .number()
  .int('Califique con un número entero de 1 a 5.')
  .min(1, 'La calificación va de 1 a 5.')
  .max(5, 'La calificación va de 1 a 5.');

export const SCORE_LABELS = {
  1: 'No cumple',
  2: 'Cumple parcialmente',
  3: 'Cumple',
  4: 'Cumple bien',
  5: 'Supera lo esperado',
} as const;

const objectiveSchema = z.strictObject({
  title: textSchema(3, 300),
  weight: z
    .number()
    .int('Escriba el peso en porcentaje entero.')
    .min(1, 'El peso es al menos 1 %.')
    .max(100, 'El peso es máximo 100 %.'),
});

const objectivesSchema = z
  .array(objectiveSchema)
  .min(1, 'Agregue al menos un objetivo.')
  .max(10, 'Son máximo 10 objetivos.')
  .refine(
    (objectives) => objectives.reduce((sum, objective) => sum + objective.weight, 0) === 100,
    'Los pesos de los objetivos deben sumar 100 %.',
  );

export const reviewObjectiveSchema = objectiveSchema.extend({ score: z.number().nullable() });

export const performanceReviewSchema = z.object({
  id: idSchema,
  employee: hrRefSchema,
  period: z.string(),
  objectives: z.array(reviewObjectiveSchema),
  /** Promedio ponderado, con dos decimales. */
  score: z.string().nullable(),
  status: performanceReviewStatusSchema,
  reviewer: hrRefSchema.nullable(),
  reviewer_comment: z.string().nullable(),
  employee_comment: z.string().nullable(),
  agreed_on: dateSchema.nullable(),
  /** A quien consulta le corresponde calificar. */
  can_score: z.boolean(),
  /** A quien consulta le corresponde aceptar (el colaborador evaluado). */
  can_agree: z.boolean(),
  version: z.number().int().positive(),
});
export const performanceReviewListResponseSchema = z.object({
  data: z.array(performanceReviewSchema),
});

export const createReviewSchema = z.strictObject({
  employee_id: idSchema,
  period: textSchema(4, 20).describe('Periodo evaluado, como «2026» o «2026-S2»'),
  objectives: objectivesSchema,
});

export const scoreReviewSchema = z.strictObject({
  scores: z.array(reviewScoreSchema).min(1).max(10).describe('Una calificación por objetivo'),
  comment: textSchema(3, 2000),
});

export const agreeReviewSchema = z.strictObject({ comment: optionalText(2000) });

// --- Formación y bienestar ----------------------------------------------------------------

export const TRAINING_KINDS = {
  induction: 'Inducción',
  reinduction: 'Reinducción',
  training: 'Capacitación',
  wellbeing: 'Bienestar',
} as const;
export type TrainingKind = keyof typeof TRAINING_KINDS;
export const trainingKindSchema = enumOf(TRAINING_KINDS);

export const TRAINING_STATUS = {
  scheduled: 'Programada',
  held: 'Realizada',
  cancelled: 'Cancelada',
} as const;
export type TrainingStatus = keyof typeof TRAINING_STATUS;
export const trainingStatusSchema = enumOf(TRAINING_STATUS);

const trainingHoursSchema = z
  .number()
  .multipleOf(0.25, 'Escriba las horas en cuartos de hora.')
  .positive('Escriba la duración.')
  .max(200, 'Son máximo 200 horas.');

export const attendanceSchema = z.object({
  employee: hrRefSchema,
  attended: z.boolean().nullable(),
  evaluation: z.number().int().nullable(),
  version: z.number().int().positive(),
});

export const trainingSchema = z.object({
  id: idSchema,
  code: z.string(),
  title: z.string(),
  kind: trainingKindSchema,
  scheduled_on: dateSchema,
  hours: z.number(),
  facilitator: z.string().nullable(),
  description: z.string().nullable(),
  status: trainingStatusSchema,
  evidence_file_id: idSchema.nullable(),
  attendees: z.array(attendanceSchema),
  version: z.number().int().positive(),
});
export const trainingListResponseSchema = z.object({ data: z.array(trainingSchema) });

export const saveTrainingSchema = z.strictObject({
  title: textSchema(3, 200),
  kind: trainingKindSchema,
  scheduled_on: dateSchema,
  hours: trainingHoursSchema,
  facilitator: optionalText(200),
  description: optionalText(2000),
  employee_ids: z
    .array(idSchema)
    .min(1, 'Seleccione al menos una persona.')
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'Hay personas repetidas.'),
});

export const recordAttendanceSchema = z
  .strictObject({
    evidence_file_id: idSchema.nullable().default(null).describe('Lista de asistencia firmada'),
    attendance: z
      .array(
        z.strictObject({
          employee_id: idSchema,
          attended: z.boolean(),
          evaluation: reviewScoreSchema.nullable().default(null),
        }),
      )
      .min(1)
      .max(500),
  })
  .refine(
    (input) => input.attendance.every((entry) => entry.attended || entry.evaluation === null),
    { path: ['attendance'], message: 'Solo se califica a quien asistió.' },
  );

export const cancelTrainingSchema = z.strictObject({ reason: textSchema(3, 1000) });

export type PerformanceReview = z.infer<typeof performanceReviewSchema>;
export type CreateReview = z.infer<typeof createReviewSchema>;
export type ScoreReview = z.infer<typeof scoreReviewSchema>;
export type AgreeReview = z.infer<typeof agreeReviewSchema>;
export type Training = z.infer<typeof trainingSchema>;
export type SaveTraining = z.infer<typeof saveTrainingSchema>;
export type RecordAttendance = z.infer<typeof recordAttendanceSchema>;
export type CancelTraining = z.infer<typeof cancelTrainingSchema>;
