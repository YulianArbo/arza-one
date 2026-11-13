import { z } from 'zod';

import { moneySchema } from '../finance/money.js';
import { consentGrantSchema } from '../privacy/consents.js';

// Talento humano (B35, ficha 17.13): vacantes, candidatos y proceso de selección. Un candidato
// pasa por postulado → preseleccionado → en evaluación → seleccionado → vinculado o descartado.
// Los datos de quien no queda se eliminan a los doce meses, salvo que autorice conservarlos.

/** Códigos estables de los errores de Talento humano (numeral 14.2). */
export const HR_ERROR_CODES = {
  recordNotFound: 'HR_RECORD_NOT_FOUND',
  recordInvalid: 'HR_RECORD_INVALID',
  statusInvalid: 'HR_STATUS_INVALID',
  personNotReady: 'HR_PERSON_NOT_READY',
  formUnavailable: 'HR_FORM_UNAVAILABLE',
} as const;

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

function enumOf<T extends Record<string, string>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

export const VACANCY_REASONS = {
  new_position: 'Cargo nuevo',
  replacement: 'Reemplazo',
  temporary: 'Necesidad temporal',
} as const;
export type VacancyReason = keyof typeof VACANCY_REASONS;
export const vacancyReasonSchema = enumOf(VACANCY_REASONS);

export const VACANCY_STATUS = {
  open: 'Abierta',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
} as const;
export type VacancyStatus = keyof typeof VACANCY_STATUS;
export const vacancyStatusSchema = enumOf(VACANCY_STATUS);

export const CANDIDATE_STAGES = {
  applied: 'Postulado',
  shortlisted: 'Preseleccionado',
  evaluating: 'En evaluación',
  selected: 'Seleccionado',
  hired: 'Vinculado',
  discarded: 'Descartado',
} as const;
export type CandidateStage = keyof typeof CANDIDATE_STAGES;
export const candidateStageSchema = enumOf(CANDIDATE_STAGES);

/** La etapa siguiente al avanzar; vincular y descartar tienen su propio paso. */
export const NEXT_STAGE: Readonly<Partial<Record<CandidateStage, CandidateStage>>> = {
  applied: 'shortlisted',
  shortlisted: 'evaluating',
  evaluating: 'selected',
};

/** Etapas desde las que se puede descartar: todas las abiertas. */
export const OPEN_CANDIDATE_STAGES: readonly CandidateStage[] = [
  'applied',
  'shortlisted',
  'evaluating',
  'selected',
];

export const CANDIDATE_SOURCES = {
  job_board: 'Portal de empleo',
  referral: 'Referido',
  website: 'Sitio web',
  social: 'Redes sociales',
  university: 'Universidad o institución',
  other: 'Otro',
} as const;
export type CandidateSource = keyof typeof CANDIDATE_SOURCES;
export const candidateSourceSchema = enumOf(CANDIDATE_SOURCES);

export const SELECTION_EVALUATION_KINDS = {
  interview: 'Entrevista',
  technical_test: 'Prueba técnica',
  psychometric: 'Prueba psicotécnica',
  references: 'Verificación de referencias',
} as const;
export type SelectionEvaluationKind = keyof typeof SELECTION_EVALUATION_KINDS;
export const selectionEvaluationKindSchema = enumOf(SELECTION_EVALUATION_KINDS);

/** Meses que se conservan los datos de un candidato no seleccionado (ficha 17.13). */
export const CANDIDATE_RETENTION_MONTHS = 12;

export const hrRefSchema = z.object({ id: idSchema, name: z.string() });

export const vacancySchema = z.object({
  id: idSchema,
  code: z.string(),
  position: hrRefSchema,
  reason: vacancyReasonSchema,
  description: z.string().nullable(),
  status: vacancyStatusSchema,
  opened_on: dateSchema,
  closed_on: dateSchema.nullable(),
  close_note: z.string().nullable(),
  candidate_count: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const selectionEvaluationSchema = z.object({
  id: idSchema,
  kind: selectionEvaluationKindSchema,
  evaluated_on: dateSchema,
  score: z.number().int().min(0).max(100),
  note: z.string().nullable(),
  evaluator: hrRefSchema.nullable(),
});

/**
 * Un candidato. Cuando sus datos se eliminan al vencer el plazo, solo queda el rastro anónimo:
 * la vacante, el origen, las etapas y las fechas.
 */
export const candidateSchema = z.object({
  id: idSchema,
  name: z.string(),
  vacancy: z.object({ id: idSchema, code: z.string(), position: z.string() }),
  source: candidateSourceSchema,
  stage: candidateStageSchema,
  applied_on: dateSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  id_type: z.string().nullable(),
  id_number: z.string().nullable(),
  resume_file_id: idSchema.nullable(),
  /** El candidato autorizó conservar su hoja de vida para futuros procesos. */
  talent_bank: z.boolean(),
  discarded_on: dateSchema.nullable(),
  discard_reason: z.string().nullable(),
  /** Fecha en que se eliminan sus datos; solo la tiene quien no quedó seleccionado. */
  retention_until: dateSchema.nullable(),
  erased_at: z.string().nullable(),
  evaluations: z.array(selectionEvaluationSchema),
  /** El colaborador que nació de este candidato, si ya se preparó su contrato. */
  employee_id: idSchema.nullable(),
  version: z.number().int().positive(),
});

export const vacancyListResponseSchema = z.object({ data: z.array(vacancySchema) });
export const candidateListResponseSchema = z.object({ data: z.array(candidateSchema) });
export const hrCreatedResponseSchema = z.object({ id: idSchema });

export const candidateListQuerySchema = z.strictObject({
  vacancy_id: idSchema.optional().describe('Solo los candidatos de esa vacante'),
});

export const saveVacancySchema = z.strictObject({
  position_id: idSchema,
  reason: vacancyReasonSchema,
  opened_on: dateSchema,
  description: optionalText(2000),
});

export const closeVacancySchema = z.strictObject({
  outcome: z.enum(['closed', 'cancelled']),
  closed_on: dateSchema,
  note: textSchema(3, 1000),
});

const personName = textSchema(2, 80);

export const candidatePersonSchema = z.strictObject({
  first_name: personName,
  last_name: personName,
  id_type: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Opción inválida')
    .describe('Código del catálogo «Tipos de documento de identidad»'),
  id_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{3,20}$/, 'Escriba solo letras y números, sin puntos ni guiones'),
  email: z.email().max(160),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{7,20}$/, 'Escriba solo números, con el indicativo si es del exterior')
    .nullable()
    .default(null),
});

export const registerCandidateSchema = z.strictObject({
  vacancy_id: idSchema,
  person: candidatePersonSchema,
  source: candidateSourceSchema,
  applied_on: dateSchema,
  resume_file_id: idSchema
    .nullable()
    .default(null)
    .describe('Hoja de vida ya revisada por el antivirus'),
  talent_bank: z
    .boolean()
    .default(false)
    .describe('Autorizó conservar su hoja de vida para futuros procesos'),
  consent: consentGrantSchema.describe('Autorización de tratamiento de datos del candidato'),
});

export const advanceCandidateSchema = z.strictObject({ note: optionalText(1000) });

export const discardCandidateSchema = z.strictObject({ reason: textSchema(3, 1000) });

export const addSelectionEvaluationSchema = z.strictObject({
  kind: selectionEvaluationKindSchema,
  evaluated_on: dateSchema,
  score: z.number().int().min(0).max(100),
  note: optionalText(2000),
});

export const CONTRACT_TYPES = {
  indefinite: 'Término indefinido',
  fixed: 'Término fijo',
  work: 'Obra o labor',
  apprenticeship: 'Aprendizaje',
} as const;
export type ContractType = keyof typeof CONTRACT_TYPES;
export const contractTypeSchema = enumOf(CONTRACT_TYPES);

/** Modalidad de trabajo (Leyes 1221 de 2008, 2088 y 2121 de 2021). */
export const WORK_MODES = {
  on_site: 'Presencial',
  telework: 'Teletrabajo',
  home: 'Trabajo en casa',
  remote: 'Trabajo remoto',
} as const;
export type WorkMode = keyof typeof WORK_MODES;
export const workModeSchema = enumOf(WORK_MODES);

/** Los contratos a término fijo, por obra o de aprendizaje llevan fecha de terminación. */
export function needsEndDate(type: ContractType): boolean {
  return type !== 'indefinite';
}

/** Lo que se pide para preparar el contrato laboral de un candidato seleccionado. */
export const hireCandidateSchema = z
  .strictObject({
    position_id: idSchema,
    hire_date: dateSchema,
    contract_type: contractTypeSchema,
    ends_on: dateSchema.nullable().default(null),
    work_mode: workModeSchema,
    salary_band: z
      .string()
      .trim()
      .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Opción inválida')
      .describe('Código del catálogo «Bandas salariales»'),
    salary: moneySchema.describe('Salario mensual en pesos'),
    work_email: z.email().max(160).describe('Correo de trabajo para la cuenta del colaborador'),
    company_signer_id: idSchema.describe('Persona de la Dirección que firma por la empresa'),
    message: optionalText(1000),
  })
  .refine((input) => needsEndDate(input.contract_type) === (input.ends_on !== null), {
    path: ['ends_on'],
    message: 'Escriba la fecha de terminación solo si el contrato no es a término indefinido.',
  })
  .refine((input) => input.ends_on === null || input.ends_on > input.hire_date, {
    path: ['ends_on'],
    message: 'La terminación debe ser posterior al ingreso.',
  });

export type HrRef = z.infer<typeof hrRefSchema>;
export type Vacancy = z.infer<typeof vacancySchema>;
export type SelectionEvaluation = z.infer<typeof selectionEvaluationSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
export type SaveVacancy = z.infer<typeof saveVacancySchema>;
export type CloseVacancy = z.infer<typeof closeVacancySchema>;
export type CandidatePerson = z.infer<typeof candidatePersonSchema>;
export type RegisterCandidate = z.infer<typeof registerCandidateSchema>;
export type AdvanceCandidate = z.infer<typeof advanceCandidateSchema>;
export type DiscardCandidate = z.infer<typeof discardCandidateSchema>;
export type AddSelectionEvaluation = z.infer<typeof addSelectionEvaluationSchema>;
export type HireCandidate = z.infer<typeof hireCandidateSchema>;
