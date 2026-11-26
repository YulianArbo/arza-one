import { z } from 'zod';

import {
  qmsDateSchema,
  qmsEnumOf,
  qmsIdSchema,
  qmsOptionalText,
  qmsRefSchema,
  qmsTextSchema,
} from './common.js';
import { periodLabel, periodStartOf } from './indicators.js';

// Normograma (RE-DG-001) y evaluación periódica del cumplimiento legal (B46, ficha 17.17;
// PR-DG-001). Cada requisito muestra su última evaluación. La evaluación es semestral
// (decisión 7): un resultado «parcial» o «no cumple» abre en la misma operación una acción de
// mejora con responsable y fecha. Las columnas del archivo están por validar frente a RE-DG-001
// (decisión 6).

export const LEGAL_NORM_TYPES = {
  law: 'Ley',
  decree: 'Decreto',
  resolution: 'Resolución',
  circular: 'Circular',
  standard: 'Norma técnica',
  other: 'Otra',
} as const;
export type LegalNormType = keyof typeof LEGAL_NORM_TYPES;
export const legalNormTypeSchema = qmsEnumOf(LEGAL_NORM_TYPES).describe('Tipo de norma');

export const LEGAL_RESULTS = {
  complies: 'Cumple',
  partial: 'Cumple parcialmente',
  fails: 'No cumple',
  not_applicable: 'No aplica',
} as const;
export type LegalResult = keyof typeof LEGAL_RESULTS;
export const legalResultSchema = qmsEnumOf(LEGAL_RESULTS).describe('Resultado de la evaluación');

/** Un resultado parcial o negativo exige su acción de mejora (decisión 7). */
export function resultNeedsAction(result: LegalResult): boolean {
  return result === 'partial' || result === 'fails';
}

/** Primer día del semestre que contiene la fecha (enero o julio). */
export function legalPeriodStart(date: string): string {
  return periodStartOf('semiannual', date);
}

/** «S1 2026» o «S2 2026». */
export function legalPeriodLabel(periodStart: string): string {
  return periodLabel('semiannual', periodStart);
}

export const legalEvaluationSchema = z.object({
  id: qmsIdSchema,
  period_start: qmsDateSchema,
  period: z.string(),
  evaluated_on: qmsDateSchema,
  result: legalResultSchema,
  evidence_note: z.string(),
  evidence_file_id: qmsIdSchema.nullable(),
  action: z.object({ id: qmsIdSchema, code: z.string() }).nullable(),
  evaluated_by: qmsRefSchema,
});
export const legalEvaluationListResponseSchema = z.object({
  data: z.array(legalEvaluationSchema),
});

export const legalRequirementSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  norm_type: legalNormTypeSchema,
  norm: z.string(),
  issuer: z.string(),
  article: z.string().nullable(),
  requirement: z.string(),
  compliance_means: z.string().nullable(),
  process: qmsRefSchema.nullable(),
  responsible: qmsRefSchema.nullable(),
  applies: z.boolean(),
  last_evaluation: legalEvaluationSchema.nullable(),
  /** Aplica y no tiene evaluación en el semestre en curso. */
  pending: z.boolean(),
  version: z.number().int().positive(),
});
export const legalRequirementListResponseSchema = z.object({
  data: z.array(legalRequirementSchema),
  current_period: z.string(),
});

export const saveLegalRequirementSchema = z.strictObject({
  norm_type: legalNormTypeSchema,
  norm: qmsTextSchema(3, 200).describe('Norma, por ejemplo «Ley 1581 de 2012»'),
  issuer: qmsTextSchema(2, 160).describe('Entidad que la expide'),
  article: qmsOptionalText(200).describe('Artículos que aplican'),
  requirement: qmsTextSchema(5, 2000).describe('Qué exige a la empresa'),
  compliance_means: qmsOptionalText(2000).describe('Cómo lo cumple la empresa y su evidencia'),
  process_id: qmsIdSchema.nullable().default(null),
  responsible_id: qmsIdSchema.nullable().default(null),
  applies: z.boolean().default(true).describe('¿Aplica a la empresa?'),
});

const actionPlanSchema = z.strictObject({
  description: qmsTextSchema(5, 2000).describe('Qué se hará para cumplir'),
  responsible_id: qmsIdSchema.describe('Cuenta de quien responde por la acción'),
  due_on: qmsDateSchema.describe('Fecha compromiso'),
});

export const evaluateLegalRequirementSchema = z
  .strictObject({
    evaluated_on: qmsDateSchema.describe('Fecha de la evaluación'),
    result: legalResultSchema,
    evidence_note: qmsTextSchema(5, 2000).describe('Qué se revisó y dónde está la evidencia'),
    evidence_file_id: qmsIdSchema.nullable().default(null),
    action: actionPlanSchema.nullable().default(null),
  })
  .refine((input) => resultNeedsAction(input.result) === (input.action !== null), {
    path: ['action'],
    message: 'Un resultado parcial o negativo lleva su acción de mejora; los demás no.',
  });

/** Columnas del archivo del normograma, en el orden propuesto para RE-DG-001 (por validar). */
export const LEGAL_FILE_COLUMNS = [
  'Código',
  'Tipo de norma',
  'Norma',
  'Entidad que la expide',
  'Artículos',
  'Requisito',
  'Cómo se cumple',
  'Proceso',
  'Responsable',
  'Aplica',
  'Última evaluación',
  'Resultado',
  'Acción',
] as const;

/**
 * Columnas del archivo de carga. Un requisito con la misma norma y los mismos artículos se
 * actualiza; los demás se crean. El tipo de norma va con su nombre («Ley», «Decreto»…) y «Aplica»
 * con «Sí» o «No».
 */
export const LEGAL_IMPORT_COLUMNS = [
  'Tipo de norma',
  'Norma',
  'Entidad que la expide',
  'Artículos',
  'Requisito',
  'Cómo se cumple',
  'Código del proceso',
  'Aplica',
] as const;

export const importLegalRequirementsSchema = z.strictObject({
  content: z.string().min(1).max(1_000_000).describe('Archivo CSV (UTF-8, punto y coma)'),
  apply: z.boolean().default(false).describe('Falso: solo revisar; verdadero: guardar'),
});

export const LEGAL_IMPORT_OUTCOMES = {
  create: 'Nuevo',
  update: 'Se actualiza',
  error: 'Con errores',
} as const;
export const legalImportOutcomeSchema = qmsEnumOf(LEGAL_IMPORT_OUTCOMES);

export const legalImportRowSchema = z.object({
  line: z.number().int().positive(),
  norm: z.string(),
  article: z.string().nullable(),
  outcome: legalImportOutcomeSchema,
  errors: z.array(z.string()),
});
export const legalImportResponseSchema = z.object({
  applied: z.boolean(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  rows: z.array(legalImportRowSchema),
});

export type LegalRequirement = z.infer<typeof legalRequirementSchema>;
export type LegalRequirementList = z.infer<typeof legalRequirementListResponseSchema>;
export type LegalEvaluation = z.infer<typeof legalEvaluationSchema>;
export type SaveLegalRequirement = z.infer<typeof saveLegalRequirementSchema>;
export type EvaluateLegalRequirement = z.infer<typeof evaluateLegalRequirementSchema>;
export type ImportLegalRequirements = z.infer<typeof importLegalRequirementsSchema>;
export type LegalImportRow = z.infer<typeof legalImportRowSchema>;
export type LegalImportResponse = z.infer<typeof legalImportResponseSchema>;
