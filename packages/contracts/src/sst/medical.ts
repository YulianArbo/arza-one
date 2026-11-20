import { z } from 'zod';

import {
  sstDateSchema,
  sstEnumOf,
  sstIdSchema,
  sstOptionalText,
  sstRefSchema,
  sstTextSchema,
} from './common.js';

// Evaluaciones médicas ocupacionales (B37, decisiones 7 y 13; Resolución 2346 de 2007). Solo se
// guarda el concepto de aptitud, las restricciones y la próxima fecha: nunca diagnósticos; la
// historia clínica queda en la institución que hizo el examen. Las restricciones van cifradas, cada
// consulta queda en la auditoría y nunca salen en exportaciones. Las ven SST y la propia persona.
// El examen de ingreso da por hecha la tarea de inducción y el de egreso, el ítem del retiro.

export const EXAM_KINDS = {
  entry: 'De ingreso',
  periodic: 'Periódico',
  exit: 'De egreso',
  post_leave: 'Post incapacidad',
  return: 'De reintegro',
} as const;
export type ExamKind = keyof typeof EXAM_KINDS;
export const examKindSchema = sstEnumOf(EXAM_KINDS);

export const APTITUDE_CONCEPTS = {
  fit: 'Apto',
  fit_with_restrictions: 'Apto con restricciones',
  deferred: 'Aplazado',
  unfit: 'No apto',
} as const;
export type AptitudeConcept = keyof typeof APTITUDE_CONCEPTS;
export const aptitudeConceptSchema = sstEnumOf(APTITUDE_CONCEPTS);

/** Lo que se ve en la lista: sin las restricciones. */
export const medicalExamSummarySchema = z.object({
  id: sstIdSchema,
  employee: sstRefSchema,
  kind: examKindSchema,
  exam_date: sstDateSchema,
  provider: z.string(),
  concept: aptitudeConceptSchema,
  has_restrictions: z.boolean(),
  next_due_on: sstDateSchema.nullable(),
  due_soon: z.boolean().describe('La próxima evaluación vence en 30 días o menos'),
  version: z.number().int().positive(),
});
export const medicalExamListResponseSchema = z.object({ data: z.array(medicalExamSummarySchema) });

/** El registro completo; la consulta queda en la auditoría. */
export const medicalExamSchema = medicalExamSummarySchema.extend({
  restrictions: z.string().nullable(),
});

export const recordMedicalExamSchema = z
  .strictObject({
    employee_id: sstIdSchema,
    kind: examKindSchema,
    exam_date: sstDateSchema,
    provider: sstTextSchema(3, 150).describe('Institución que hizo la evaluación'),
    concept: aptitudeConceptSchema,
    restrictions: sstOptionalText(2000).describe(
      'Restricciones o recomendaciones laborales; nunca diagnósticos',
    ),
    next_due_on: sstDateSchema.nullable().default(null),
  })
  .refine((input) => input.concept !== 'fit_with_restrictions' || input.restrictions !== null, {
    path: ['restrictions'],
    message: 'Escriba las restricciones del concepto.',
  })
  .refine((input) => input.next_due_on === null || input.next_due_on > input.exam_date, {
    path: ['next_due_on'],
    message: 'La próxima evaluación va después de esta.',
  });

export type MedicalExamSummary = z.infer<typeof medicalExamSummarySchema>;
export type MedicalExam = z.infer<typeof medicalExamSchema>;
export type RecordMedicalExam = z.infer<typeof recordMedicalExamSchema>;
