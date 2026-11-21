import { z } from 'zod';

import {
  sstDateSchema,
  sstEnumOf,
  sstIdSchema,
  sstOptionalText,
  sstRefSchema,
  sstTextSchema,
} from './common.js';

// Inspecciones, incluidas las del puesto de trabajo en casa (B37, decisión 11; Ley 2088 de 2021).
// Cada tipo tiene su lista de chequeo en un catálogo editable. SST hace y registra las inspecciones
// de instalaciones y de emergencias; la del puesto en casa la solicita SST, la responde el
// colaborador desde «Mi espacio» y SST la revisa con sus hallazgos.

export const INSPECTION_KINDS = {
  facility: 'Instalaciones',
  home: 'Puesto de trabajo en casa',
  emergency: 'Botiquín, extintores y emergencias',
} as const;
export type InspectionKind = keyof typeof INSPECTION_KINDS;
export const inspectionKindSchema = sstEnumOf(INSPECTION_KINDS);

/** Catálogo con la lista de chequeo de cada tipo de inspección. */
export const INSPECTION_CATALOGS: Readonly<Record<InspectionKind, string>> = {
  facility: 'sst_check_facility',
  home: 'sst_check_home',
  emergency: 'sst_check_emergency',
};

export const INSPECTION_STATUS = {
  requested: 'Solicitada al colaborador',
  submitted: 'Por revisar',
  reviewed: 'Revisada',
} as const;
export const inspectionStatusSchema = sstEnumOf(INSPECTION_STATUS);

export const INSPECTION_CHECK_RESULTS = {
  ok: 'Cumple',
  fail: 'No cumple',
  na: 'No aplica',
} as const;
export const inspectionCheckResultSchema = sstEnumOf(INSPECTION_CHECK_RESULTS);

export const checklistItemSchema = z.object({ code: z.string(), label: z.string() });
export const checklistResponseSchema = z.object({
  kind: inspectionKindSchema,
  data: z.array(checklistItemSchema),
});

export const inspectionAnswerSchema = z.strictObject({
  code: z.string().trim().min(1).max(20),
  result: inspectionCheckResultSchema,
  note: sstOptionalText(300),
});

export const inspectionAnswerViewSchema = z.object({
  code: z.string(),
  label: z.string(),
  result: inspectionCheckResultSchema,
  note: z.string().nullable(),
});

export const inspectionSchema = z.object({
  id: sstIdSchema,
  kind: inspectionKindSchema,
  status: inspectionStatusSchema,
  place: z.string().nullable(),
  employee: sstRefSchema.nullable(),
  inspector: sstRefSchema.nullable(),
  due_on: sstDateSchema.nullable(),
  inspected_on: sstDateSchema.nullable(),
  answers: z.array(inspectionAnswerViewSchema),
  failed: z.number().int().nonnegative(),
  findings: z.string().nullable(),
  version: z.number().int().positive(),
});
export const inspectionListResponseSchema = z.object({ data: z.array(inspectionSchema) });

const answersSchema = z.array(inspectionAnswerSchema).min(1).max(60);

/** Inspección hecha por SST (instalaciones o emergencias). */
export const recordInspectionSchema = z.strictObject({
  kind: z.enum(['facility', 'emergency']),
  inspected_on: sstDateSchema,
  place: sstTextSchema(3, 200),
  answers: answersSchema,
  findings: sstOptionalText(2000),
});

/** SST pide al colaborador la autoinspección de su puesto en casa. */
export const requestHomeInspectionSchema = z.strictObject({
  employee_id: sstIdSchema,
  due_on: sstDateSchema,
});

/** El colaborador responde la lista de chequeo de su puesto en casa. */
export const answerHomeInspectionSchema = z.strictObject({
  place: sstTextSchema(3, 200).describe('Ciudad y barrio, sin la dirección exacta'),
  answers: answersSchema,
});

export const reviewInspectionSchema = z.strictObject({
  findings: sstTextSchema(3, 2000).describe('Hallazgos y recomendaciones'),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type InspectionAnswer = z.infer<typeof inspectionAnswerSchema>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type RecordInspection = z.infer<typeof recordInspectionSchema>;
export type RequestHomeInspection = z.infer<typeof requestHomeInspectionSchema>;
export type AnswerHomeInspection = z.infer<typeof answerHomeInspectionSchema>;
export type ReviewInspection = z.infer<typeof reviewInspectionSchema>;
