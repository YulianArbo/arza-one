import { z } from 'zod';

import { moneySchema } from '../finance/money.js';
import { contractTypeSchema, hrRefSchema, workModeSchema } from './selection.js';

// Colaboradores, contrato laboral con firma, inducción e historia laboral (B35, ficha 17.13). El
// contrato se firma electrónicamente (primero el colaborador, luego la empresa); con el contrato
// firmado, «Vincular» crea la cuenta, las tareas de inducción, la evaluación médica de ingreso y la
// asignación de equipo. La historia laboral y el salario exacto son información restringida.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

export const EMPLOYEE_STATUS = {
  pending: 'Por vincular',
  active: 'Activo',
  cancelled: 'Vinculación anulada',
  terminated: 'Retirado',
} as const;
export type EmployeeStatus = keyof typeof EMPLOYEE_STATUS;
export const employeeStatusSchema = enumOf(EMPLOYEE_STATUS);

export const EMPLOYMENT_CONTRACT_STATUS = {
  preparing: 'Preparando el contrato',
  in_signature: 'En firma',
  signed: 'Firmado',
  cancelled: 'Anulado',
} as const;
export type EmploymentContractStatus = keyof typeof EMPLOYMENT_CONTRACT_STATUS;
export const employmentContractStatusSchema = enumOf(EMPLOYMENT_CONTRACT_STATUS);

/** Días que tienen el colaborador y la empresa para firmar el contrato laboral. */
export const HIRING_SIGNATURE_DAYS = 10;

/** Quién responde por una tarea de inducción. */
export type OnboardingResponsible = 'hr' | 'sst' | 'assets' | 'manager';

/**
 * Tareas que crea la vinculación (ficha 17.13 y numeral 13.3 «employee.hired»). La evaluación
 * médica solo registra que se hizo: el concepto de aptitud llega con el módulo de SST (B37).
 */
export const ONBOARDING_TASKS = {
  medical_exam: {
    label: 'Evaluación médica ocupacional de ingreso',
    responsible: 'sst',
    due_days: 0,
  },
  equipment: { label: 'Asignación de equipo y activos', responsible: 'assets', due_days: 0 },
  social_security: {
    label: 'Afiliaciones a seguridad social (salud, pensión, riesgos laborales y caja)',
    responsible: 'hr',
    due_days: 0,
  },
  induction: {
    label: 'Inducción institucional: sistema de gestión, políticas y Reglamento Interno de Trabajo',
    responsible: 'hr',
    due_days: 5,
  },
  sst_induction: {
    label: 'Inducción en seguridad y salud en el trabajo',
    responsible: 'sst',
    due_days: 5,
  },
  job_training: { label: 'Entrenamiento en el cargo', responsible: 'manager', due_days: 30 },
} as const satisfies Record<
  string,
  { label: string; responsible: OnboardingResponsible; due_days: number }
>;
export type OnboardingTaskKind = keyof typeof ONBOARDING_TASKS;
export const onboardingTaskKindSchema = enumOf(ONBOARDING_TASKS);

/**
 * Lista de chequeo aprobada para B35. La carga del formato RE-GTH-002 se hará en otro bloque.
 */
export const FILE_ITEMS = {
  id_document: 'Documento de identidad',
  resume: 'Hoja de vida',
  education: 'Certificados de estudio',
  work_certificates: 'Certificados laborales anteriores',
  background_checks: 'Antecedentes disciplinarios, fiscales y judiciales',
  medical_concept: 'Concepto de aptitud del examen médico de ingreso',
  health_affiliation: 'Afiliación a salud (EPS)',
  pension_affiliation: 'Afiliación a pensión',
  risk_affiliation: 'Afiliación a riesgos laborales (ARL)',
  compensation_fund: 'Afiliación a caja de compensación',
  bank_certificate: 'Certificación bancaria',
  signed_contract: 'Contrato laboral firmado',
  data_authorization: 'Autorización de tratamiento de datos',
} as const;
export type FileItem = keyof typeof FILE_ITEMS;
export const fileItemSchema = enumOf(FILE_ITEMS);

export const FILE_ITEM_STATUS = {
  pending: 'Pendiente',
  received: 'Recibido',
  not_applicable: 'No aplica',
} as const;
export type FileItemStatus = keyof typeof FILE_ITEM_STATUS;
export const fileItemStatusSchema = enumOf(FILE_ITEM_STATUS);

export const employeeSchema = z.object({
  id: idSchema,
  name: z.string(),
  position: hrRefSchema,
  hire_date: dateSchema,
  contract_type: contractTypeSchema,
  work_mode: workModeSchema,
  status: employeeStatusSchema,
  /** La cuenta del colaborador; existe desde que se vincula. */
  user_id: idSchema.nullable(),
  candidate_id: idSchema.nullable(),
  version: z.number().int().positive(),
});

export const contractSignerSchema = z.object({
  name: z.string(),
  role: z.string(),
  status: z.enum(['waiting', 'pending', 'signed', 'rejected']),
});

export const employmentContractSchema = z.object({
  id: idSchema,
  record_code: z.string().nullable(),
  envelope_code: z.string().nullable(),
  type: contractTypeSchema,
  starts_on: dateSchema,
  ends_on: dateSchema.nullable(),
  salary_band: z.string(),
  salary_band_label: z.string(),
  /** El salario exacto: null para quien no tiene el permiso de ver salarios. */
  salary: moneySchema.nullable(),
  status: employmentContractStatusSchema,
  signers: z.array(contractSignerSchema),
  sign_by: dateSchema,
  signed_on: dateSchema.nullable(),
  closed_reason: z.string().nullable(),
  /** A quien consulta le toca firmar por la empresa. */
  my_turn: z.boolean(),
  /** Se puede descargar el PDF: lo ve Talento humano y quien firma por la empresa. */
  document_available: z.boolean(),
  version: z.number().int().positive(),
});

export const fileEntrySchema = z.object({
  item: fileItemSchema,
  status: fileItemStatusSchema,
  file_id: idSchema.nullable(),
  note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const onboardingTaskSchema = z.object({
  id: idSchema,
  employee: hrRefSchema,
  kind: onboardingTaskKindSchema,
  title: z.string(),
  responsible: hrRefSchema.nullable(),
  due_on: dateSchema,
  done_on: dateSchema.nullable(),
  note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const employeeDetailResponseSchema = z.object({
  employee: employeeSchema,
  email: z.string().nullable().describe('Correo de trabajo de la cuenta'),
  contract: employmentContractSchema.nullable(),
  /** La historia laboral: null para quien no tiene el permiso restringido. */
  file: z.array(fileEntrySchema).nullable(),
  onboarding: z.array(onboardingTaskSchema),
});

export const employeeListResponseSchema = z.object({ data: z.array(employeeSchema) });
export const onboardingTaskListResponseSchema = z.object({ data: z.array(onboardingTaskSchema) });

/** Quien puede firmar por la empresa: personas activas de la Dirección; «ready» si ya pueden. */
export const companySignerOptionSchema = z.object({
  id: idSchema,
  name: z.string(),
  ready: z.boolean(),
});
export const companySignerListResponseSchema = z.object({
  data: z.array(companySignerOptionSchema),
});

export const onboardingTaskListQuerySchema = z.strictObject({
  pending: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
    .describe('Solo las tareas sin hacer'),
});

export const cancelHiringSchema = z.strictObject({ reason: textSchema(3, 1000) });

export const updateFileEntrySchema = z
  .strictObject({
    status: fileItemStatusSchema,
    file_id: idSchema.nullable().default(null).describe('Soporte ya revisado por el antivirus'),
    note: optionalText(500),
  })
  .refine((entry) => entry.status === 'received' || entry.file_id === null, {
    path: ['file_id'],
    message: 'Solo un documento recibido lleva soporte.',
  });

export const completeOnboardingTaskSchema = z.strictObject({
  done_on: dateSchema,
  note: optionalText(1000),
});

export const signHiringSchema = z.strictObject({
  accept: z.literal(true, 'Marque la casilla para firmar.'),
});

export const rejectHiringSchema = z.strictObject({ reason: textSchema(3, 1000) });

export type Employee = z.infer<typeof employeeSchema>;
export type ContractSigner = z.infer<typeof contractSignerSchema>;
export type EmploymentContract = z.infer<typeof employmentContractSchema>;
export type FileEntry = z.infer<typeof fileEntrySchema>;
export type OnboardingTask = z.infer<typeof onboardingTaskSchema>;
export type EmployeeDetail = z.infer<typeof employeeDetailResponseSchema>;
export type CompanySignerOption = z.infer<typeof companySignerOptionSchema>;
export type OnboardingTaskListQuery = z.infer<typeof onboardingTaskListQuerySchema>;
export type CancelHiring = z.infer<typeof cancelHiringSchema>;
export type UpdateFileEntry = z.infer<typeof updateFileEntrySchema>;
export type CompleteOnboardingTask = z.infer<typeof completeOnboardingTaskSchema>;
export type RejectHiring = z.infer<typeof rejectHiringSchema>;
