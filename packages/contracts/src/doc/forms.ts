import { z } from 'zod';

import { formDefinitionSchema, formLayoutSchema } from './form-schema.js';
import { renderStatusSchema } from './versions.js';

// Contratos de los formatos digitales (M03, B20; ficha 17.4 y capítulo 18, forma B). Calidad
// diseña el formato y lo publica: cada publicación es una versión nueva e inmutable. Un registro
// diligenciado guarda para siempre la versión del formato con que se creó; si el formato lo pide,
// pasa por aprobación en el motor de flujos y al terminar se genera su PDF institucional.

const dateTime = z.iso.datetime({ offset: true });
const person = z.object({ id: z.uuid(), name: z.string() });

/** Código del formato en el Listado Maestro: FT-COM-002, RE-SGC-003… */
export const formCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,3}-[A-Z]{2,3}-\d{3,8}$/u, 'Escriba el código del Listado Maestro (FT-COM-002).');

export const FORM_TEMPLATE_STATUSES = {
  draft: 'Borrador',
  published: 'Publicado',
  retired: 'Retirado',
} as const;

export type FormTemplateStatus = keyof typeof FORM_TEMPLATE_STATUSES;

export const formTemplateStatusSchema = z
  .enum(Object.keys(FORM_TEMPLATE_STATUSES) as [FormTemplateStatus, ...FormTemplateStatus[]])
  .describe('Borrador, publicado (en uso) o retirado');

/** Flujos de aprobación de los registros (datos del motor, editables en Administración › Flujos). */
export const FORM_FLOWS = {
  'doc.form_record.direction': 'Aprobación de Dirección',
  'doc.form_record.quality': 'Aprobación de Calidad',
} as const;

export type FormFlowKey = keyof typeof FORM_FLOWS;

export const formFlowKeySchema = z
  .enum(Object.keys(FORM_FLOWS) as [FormFlowKey, ...FormFlowKey[]])
  .describe('Flujo de aprobación de los registros; sin flujo, el registro termina al enviarlo');

/** Registros de otros módulos a los que se une un registro diligenciado. */
export const FORM_ENTITY_TYPES = {
  doc_version: 'Versión de un documento',
  party: 'Tercero',
  doc_change_request: 'Solicitud de acción documental',
  prj_acceptance: 'Acta de entrega de un proyecto',
  prj_code_review: 'Revisión de código de un proyecto',
  ast_assignment: 'Asignación de un activo en comodato',
  hr_contract: 'Contrato laboral de un colaborador',
  inn_idea: 'Idea del banco de ideas',
} as const;

export type FormEntityType = keyof typeof FORM_ENTITY_TYPES;

export const formEntityTypeSchema = z
  .enum(Object.keys(FORM_ENTITY_TYPES) as [FormEntityType, ...FormEntityType[]])
  .describe('A qué registro se une cada registro diligenciado');

/** Quién diligencia: una persona, o la plataforma con los datos de otro registro (FT-SGC-001). */
export const formFillModeSchema = z
  .enum(['manual', 'system'])
  .describe('Lo diligencia una persona o lo llena la plataforma');

export const formClassificationSchema = z
  .enum(['internal', 'confidential'])
  .describe(
    'Confidencial: solo lo ven quien lo diligencia, quien aprueba y quien gestiona terceros',
  );

export const formTemplateActionSchema = z.enum([
  'edit',
  'publish',
  'retire',
  'new_version',
  'fill',
]);

export type FormTemplateAction = z.infer<typeof formTemplateActionSchema>;

const reference = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

export const formTemplateSummarySchema = z.object({
  id: z.uuid(),
  code: formCodeSchema,
  name: z.string(),
  form_version: z.number().int().positive().describe('Versión del formato: 1, 2…'),
  status: formTemplateStatusSchema,
  fill_mode: formFillModeSchema,
  workflow_key: formFlowKeySchema.nullable(),
  classification: formClassificationSchema,
  entity_type: formEntityTypeSchema.nullable(),
  field_count: z.number().int().nonnegative(),
  published_at: dateTime.nullable(),
  version: z.number().int().positive(),
});

export const formTemplateSchema = formTemplateSummarySchema.extend({
  definition: formDefinitionSchema,
  layout: formLayoutSchema,
  document: reference.nullable().describe('Su documento en el Listado Maestro'),
  output_template: reference
    .extend({ output_version: z.number().int().positive() })
    .nullable()
    .describe('Plantilla de salida del PDF; sin ella se usa la maqueta institucional del formato'),
  published_by: person.nullable(),
  actions: z.array(formTemplateActionSchema).describe('Lo que la persona puede hacer ahora'),
});

export const formTemplateListQuerySchema = z.strictObject({
  status: formTemplateStatusSchema.optional(),
  code: formCodeSchema.optional().describe('Todas las versiones de un formato'),
  fillable: z
    .enum(['true', 'false'])
    .optional()
    .describe('Solo la versión publicada de cada formato que una persona puede diligenciar'),
});

export const formTemplateListResponseSchema = z.object({
  data: z
    .array(formTemplateSummarySchema)
    .describe('Por código y de la versión más nueva a la más antigua'),
});

const templateContent = {
  name: z.string().trim().min(3).max(200),
  definition: formDefinitionSchema,
  layout: formLayoutSchema.default({ orientation: 'portrait' }),
  document_id: z.uuid().nullable().default(null),
  output_template_id: z.uuid().nullable().default(null),
  workflow_key: formFlowKeySchema.nullable().default(null),
  classification: formClassificationSchema.default('internal'),
  entity_type: formEntityTypeSchema.nullable().default(null),
};

/** Formato nuevo, o versión nueva en borrador de uno que ya existe (mismo código). */
export const createFormTemplateSchema = z.strictObject({
  code: formCodeSchema,
  ...templateContent,
});

export const updateFormTemplateSchema = z.strictObject(templateContent);

export const formPreviewResponseSchema = z.object({
  html: z.string().describe('Página completa, con el encabezado y el pie institucionales'),
});

// Registros diligenciados ------------------------------------------------------------------------

export const FORM_RECORD_STATUSES = {
  draft: 'Borrador',
  in_approval: 'En aprobación',
  completed: 'Terminado',
} as const;

export type FormRecordStatus = keyof typeof FORM_RECORD_STATUSES;

export const formRecordStatusSchema = z
  .enum(Object.keys(FORM_RECORD_STATUSES) as [FormRecordStatus, ...FormRecordStatus[]])
  .describe('Borrador, en aprobación o terminado');

export const formRecordStepSchema = z
  .enum(['submit', 'approve', 'reject'])
  .describe('Enviar, aprobar o devolver para corregir');

export type FormRecordStep = z.infer<typeof formRecordStepSchema>;

export const formRecordActionSchema = z.enum(['edit', 'submit', 'approve', 'reject', 'download']);

export type FormRecordAction = z.infer<typeof formRecordActionSchema>;

export const pdfStatusSchema = z
  .union([z.literal('none'), renderStatusSchema])
  .describe('PDF: sin pedir, generándose, listo o fallido');

/** Código del registro: FT-COM-002-2026-0001. */
export const formRecordCodeSchema = z
  .string()
  .regex(/^[A-Z]{2,3}-[A-Z]{2,3}-\d{3,8}-\d{4}-\d{4,8}$/u);

/** Forma general de un valor: texto, sí o no, vacío, o filas (de una verificación o una tabla). */
const formValueJson = z
  .union([
    z.string(),
    z.boolean(),
    z.null(),
    z.array(z.record(z.string(), z.union([z.string(), z.null()]))),
  ])
  .describe('Valor según el tipo del campo');

export const formRecordSummarySchema = z.object({
  id: z.uuid(),
  code: formRecordCodeSchema,
  status: formRecordStatusSchema,
  template: reference.extend({ form_version: z.number().int().positive() }),
  entity: z
    .object({ type: formEntityTypeSchema, id: z.uuid(), label: z.string() })
    .nullable()
    .describe('Registro al que pertenece'),
  classification: formClassificationSchema,
  created_by: person.nullable(),
  created_at: dateTime,
  submitted_at: dateTime.nullable(),
  pdf_status: pdfStatusSchema,
  version: z.number().int().positive(),
});

export const formRecordSchema = formRecordSummarySchema.extend({
  definition: formDefinitionSchema.describe('Campos de la versión del formato con que se creó'),
  layout: formLayoutSchema,
  data: z.record(z.string(), formValueJson),
  approved_by: person.nullable(),
  approved_at: dateTime.nullable(),
  return_note: z.string().nullable().describe('Motivo de la última devolución'),
  step: z.string().nullable().describe('Paso actual de la aprobación'),
  actions: z.array(formRecordActionSchema),
});

export const formRecordListQuerySchema = z.strictObject({
  template_code: formCodeSchema.optional(),
  status: formRecordStatusSchema.optional(),
  entity_type: formEntityTypeSchema.optional(),
  entity_id: z.uuid().optional(),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const formRecordListResponseSchema = z.object({
  data: z.array(formRecordSummarySchema).describe('Del más reciente al más antiguo'),
  next_cursor: z.uuid().nullable(),
});

const formDataInput = z
  .record(z.string(), formValueJson)
  .describe('Valores por nombre interno del campo; se validan con la versión del formato');

export const createFormRecordSchema = z
  .strictObject({
    template_id: z.uuid().describe('La versión publicada del formato'),
    data: formDataInput.default({}),
    entity_type: formEntityTypeSchema.nullable().default(null),
    entity_id: z.uuid().nullable().default(null),
  })
  .refine((value) => (value.entity_type === null) === (value.entity_id === null), {
    path: ['entity_id'],
    message: 'Elija el registro al que pertenece.',
  });

export const updateFormRecordSchema = z.strictObject({ data: formDataInput });

export const formRecordStepRequestSchema = z.strictObject({
  comment: z
    .string()
    .trim()
    .min(5)
    .max(2000)
    .nullable()
    .default(null)
    .describe('Obligatorio al devolver'),
});

export type FormTemplateSummary = z.infer<typeof formTemplateSummarySchema>;
export type FormTemplate = z.infer<typeof formTemplateSchema>;
export type FormTemplateListQuery = z.infer<typeof formTemplateListQuerySchema>;
export type FormTemplateListResponse = z.infer<typeof formTemplateListResponseSchema>;
export type CreateFormTemplate = z.infer<typeof createFormTemplateSchema>;
export type UpdateFormTemplate = z.infer<typeof updateFormTemplateSchema>;
export type FormPreviewResponse = z.infer<typeof formPreviewResponseSchema>;
export type FormRecordSummary = z.infer<typeof formRecordSummarySchema>;
export type FormRecord = z.infer<typeof formRecordSchema>;
export type FormRecordListQuery = z.infer<typeof formRecordListQuerySchema>;
export type FormRecordListResponse = z.infer<typeof formRecordListResponseSchema>;
export type CreateFormRecord = z.infer<typeof createFormRecordSchema>;
export type UpdateFormRecord = z.infer<typeof updateFormRecordSchema>;
export type FormRecordStepRequest = z.infer<typeof formRecordStepRequestSchema>;
export type PdfStatus = z.infer<typeof pdfStatusSchema>;
export type FormClassification = z.infer<typeof formClassificationSchema>;
export type FormFillMode = z.infer<typeof formFillModeSchema>;
