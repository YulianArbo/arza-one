import { z } from 'zod';

import { hrRefSchema } from './selection.js';

// Proceso disciplinario con debido proceso (B36, ficha 17.13, decisión 8; Código Sustantivo del
// Trabajo y RIT-001). Los pasos van en orden y ninguno se salta: apertura → citación → descargos →
// decisión motivada. Entre la citación y la diligencia de descargos pasan al menos los días
// hábiles del parámetro «Reglas laborales». Es información restringida: va cifrada, solo la
// gestiona Talento humano, cada consulta queda registrada y nunca sale en exportaciones. El
// colaborador ve en «Mi espacio» la citación y la decisión de su caso, no las notas internas.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

function enumOf<T extends Record<string, unknown>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

export const DISCIPLINARY_STATUS = {
  opened: 'Abierto',
  cited: 'Citado a descargos',
  heard: 'Descargos rendidos',
  decided: 'Decidido',
} as const;
export type DisciplinaryStatus = keyof typeof DISCIPLINARY_STATUS;
export const disciplinaryStatusSchema = enumOf(DISCIPLINARY_STATUS);

export const DISCIPLINARY_DECISIONS = {
  warning: 'Llamado de atención',
  suspension: 'Suspensión',
  dismissal: 'Terminación con justa causa',
  archive: 'Archivo',
} as const;
export type DisciplinaryDecision = keyof typeof DISCIPLINARY_DECISIONS;
export const disciplinaryDecisionSchema = enumOf(DISCIPLINARY_DECISIONS);

/** Lo que cualquiera con acceso al caso puede ver de él. */
export const disciplinarySummarySchema = z.object({
  id: idSchema,
  code: z.string(),
  employee: hrRefSchema,
  status: disciplinaryStatusSchema,
  opened_on: dateSchema,
  hearing_on: dateSchema.nullable(),
  decided_on: dateSchema.nullable(),
  decision: disciplinaryDecisionSchema.nullable(),
  version: z.number().int().positive(),
});
export const disciplinaryListResponseSchema = z.object({
  data: z.array(disciplinarySummarySchema),
});

/** El caso completo para Talento humano. Cada consulta queda en la auditoría. */
export const disciplinaryCaseSchema = disciplinarySummarySchema.extend({
  facts: z.string(),
  cited_on: dateSchema.nullable(),
  citation_file_id: idSchema.nullable(),
  statement: z.string().nullable().describe('Resumen de los descargos'),
  hearing_record_file_id: idSchema.nullable().describe('Acta de descargos firmada'),
  suspension_days: z.number().int().nullable(),
  reasoning: z.string().nullable(),
  decision_file_id: idSchema.nullable(),
});

/** Lo que ve el colaborador de su propio caso, desde la citación. */
export const ownDisciplinaryCaseSchema = disciplinarySummarySchema.extend({
  facts: z.string(),
  cited_on: dateSchema.nullable(),
  suspension_days: z.number().int().nullable(),
  reasoning: z.string().nullable(),
});
export const ownDisciplinaryListResponseSchema = z.object({
  data: z.array(ownDisciplinaryCaseSchema),
});

export const openDisciplinarySchema = z.strictObject({
  employee_id: idSchema,
  facts: textSchema(20, 8000).describe('Hechos que motivan el proceso'),
});

export const citeDisciplinarySchema = z.strictObject({
  hearing_on: dateSchema.describe('Fecha de la diligencia de descargos'),
  citation_file_id: idSchema.nullable().default(null).describe('Citación firmada'),
});

export const recordHearingSchema = z.strictObject({
  statement: textSchema(10, 8000).describe('Resumen de lo que dijo el colaborador'),
  hearing_record_file_id: idSchema.describe('Acta de descargos firmada, ya revisada'),
});

export const decideDisciplinarySchema = z
  .strictObject({
    decision: disciplinaryDecisionSchema,
    suspension_days: z
      .number()
      .int('Escriba días enteros.')
      .min(1, 'La suspensión es de al menos un día.')
      .max(60, 'La suspensión es de máximo 60 días.')
      .nullable()
      .default(null),
    reasoning: textSchema(20, 8000).describe('Decisión motivada'),
    decision_file_id: idSchema.nullable().default(null),
  })
  .refine((input) => (input.decision === 'suspension') === (input.suspension_days !== null), {
    path: ['suspension_days'],
    message: 'Indique los días solo cuando la decisión es suspensión.',
  });

export type DisciplinarySummary = z.infer<typeof disciplinarySummarySchema>;
export type DisciplinaryCase = z.infer<typeof disciplinaryCaseSchema>;
export type OwnDisciplinaryCase = z.infer<typeof ownDisciplinaryCaseSchema>;
export type OpenDisciplinary = z.infer<typeof openDisciplinarySchema>;
export type CiteDisciplinary = z.infer<typeof citeDisciplinarySchema>;
export type RecordHearing = z.infer<typeof recordHearingSchema>;
export type DecideDisciplinary = z.infer<typeof decideDisciplinarySchema>;
