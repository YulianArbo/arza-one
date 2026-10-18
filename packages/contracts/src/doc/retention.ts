import { z } from 'zod';

import { documentTypeSchema } from './documents.js';

// Contratos de la tabla de retención (M03, B21; RE-SGC-005, numeral 12.4): cada serie documental
// con sus años en el archivo de gestión y en el central y su disposición final. Una regla se aplica
// a los documentos de su tipo, de su proceso o de los dos; la más específica gana, y un documento
// puede llevar otra como excepción.

const calendarDate = z.iso.date();

export const RETENTION_DISPOSITIONS = {
  destroy: 'Eliminar',
  keep: 'Conservación total',
} as const;

export type RetentionDisposition = keyof typeof RETENTION_DISPOSITIONS;

export const retentionDispositionSchema = z
  .enum(Object.keys(RETENTION_DISPOSITIONS) as [RetentionDisposition, ...RetentionDisposition[]])
  .describe('Qué pasa al vencer: eliminar o conservar para siempre');

/** Código de la serie en el RE-SGC-005, como CON-01 o HL. */
export const retentionRuleCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/u, 'Use letras, números y guiones (hasta 20)')
  .describe('Código de la serie documental');

const years = z.number().int().min(0).max(100);

const processReference = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

/** Datos de la regla que se escriben al crearla o editarla. */
const ruleFields = {
  name: z.string().trim().min(3).max(200).describe('Nombre de la serie documental'),
  doc_type: documentTypeSchema.nullable().describe('Tipo de documento al que se aplica'),
  process_id: z.uuid().nullable().describe('Proceso al que se aplica'),
  active_years: years.describe('Años en el archivo de gestión'),
  archive_years: years.describe('Años en el archivo central'),
  disposition: retentionDispositionSchema,
  legal_basis: z.string().trim().min(3).max(500).describe('Fundamento legal o del SGC'),
};

type RuleFields = { [K in keyof typeof ruleFields]: z.infer<(typeof ruleFields)[K]> };

/** Lo que una regla exige en conjunto; vacío si está bien. */
export function retentionRuleProblems(
  value: Pick<RuleFields, 'doc_type' | 'process_id' | 'active_years' | 'archive_years'>,
): { readonly path: string; readonly message: string }[] {
  const problems: { path: string; message: string }[] = [];
  if (value.doc_type === null && value.process_id === null) {
    problems.push({
      path: 'doc_type',
      message: 'Elija el tipo de documento, el proceso o los dos.',
    });
  }
  if (value.active_years + value.archive_years < 1) {
    problems.push({ path: 'archive_years', message: 'La retención suma por lo menos un año.' });
  }
  return problems;
}

function checkRule(value: RuleFields, context: z.RefinementCtx): void {
  for (const { path, message } of retentionRuleProblems(value)) {
    context.addIssue({ code: 'custom', path: [path], message });
  }
}

export const createRetentionRuleSchema = z
  .strictObject({ code: retentionRuleCodeSchema, ...ruleFields })
  .superRefine(checkRule);

export const updateRetentionRuleSchema = z
  .strictObject({
    ...ruleFields,
    is_active: z.boolean().describe('Una regla inactiva no se aplica'),
  })
  .superRefine(checkRule);

export const retentionRuleSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  doc_type: z.string().nullable(),
  doc_type_label: z.string().nullable().describe('Nombre del tipo en el catálogo'),
  process: processReference.nullable(),
  active_years: z.number().int(),
  archive_years: z.number().int(),
  disposition: retentionDispositionSchema,
  legal_basis: z.string(),
  is_active: z.boolean(),
  documents: z.number().int().nonnegative().describe('Documentos a los que se aplica hoy'),
  version: z.number().int().positive(),
});

export const retentionRuleListResponseSchema = z.object({
  data: z.array(retentionRuleSchema).describe('En orden de código'),
  unassigned_documents: z
    .number()
    .int()
    .nonnegative()
    .describe('Documentos publicados sin regla: deben quedar en cero (capítulo 18.2, paso 4)'),
});

export const unassignedDocumentsResponseSchema = z.object({
  data: z
    .array(z.object({ id: z.uuid(), code: z.string(), title: z.string(), doc_type: z.string() }))
    .describe('Los primeros 100, en orden de código'),
  total: z.number().int().nonnegative(),
});

/** La retención de un documento: su regla, desde cuándo corre el plazo y cuándo vence. */
export const documentRetentionSchema = z.object({
  rule: z
    .object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      active_years: z.number().int(),
      archive_years: z.number().int(),
      disposition: retentionDispositionSchema,
    })
    .nullable()
    .describe('La regla que se aplica; null si no tiene'),
  explicit: z.boolean().describe('La regla es una excepción propia del documento'),
  base_on: calendarDate
    .nullable()
    .describe('Desde cuándo corre: obsoleto (SGC) o publicado (expediente)'),
  due_on: calendarDate.nullable().describe('Cuándo vence; null si el plazo aún no corre'),
  expired: z.boolean(),
  version: z.number().int().positive().describe('Versión del documento, para If-Match'),
});

export const setDocumentRetentionRuleSchema = z.strictObject({
  retention_rule_id: z
    .uuid()
    .nullable()
    .describe('La regla de excepción; null para usar la de su tipo y proceso'),
});

export type RetentionRule = z.infer<typeof retentionRuleSchema>;
export type RetentionRuleListResponse = z.infer<typeof retentionRuleListResponseSchema>;
export type CreateRetentionRule = z.infer<typeof createRetentionRuleSchema>;
export type UpdateRetentionRule = z.infer<typeof updateRetentionRuleSchema>;
export type UnassignedDocumentsResponse = z.infer<typeof unassignedDocumentsResponseSchema>;
export type DocumentRetention = z.infer<typeof documentRetentionSchema>;
export type SetDocumentRetentionRule = z.infer<typeof setDocumentRetentionRuleSchema>;
