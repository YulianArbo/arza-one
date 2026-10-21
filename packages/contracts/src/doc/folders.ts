import { z } from 'zod';

// Contratos de las carpetas y expedientes (M03, B18; ficha 17.4). Un expediente es la carpeta de
// un registro de otro módulo; por ahora, de un tercero (cliente o proveedor).

/** Códigos estables de los errores de la gestión documental (numeral 14.2). */
export const DOC_ERROR_CODES = {
  folderNotFound: 'DOC_FOLDER_NOT_FOUND',
  folderInvalid: 'DOC_FOLDER_INVALID',
  caseFileExists: 'DOC_CASE_FILE_EXISTS',
  documentNotFound: 'DOC_DOCUMENT_NOT_FOUND',
  referenceInvalid: 'DOC_REFERENCE_INVALID',
  versionNotFound: 'DOC_VERSION_NOT_FOUND',
  versionNotEditable: 'DOC_VERSION_NOT_EDITABLE',
  versionInProgress: 'DOC_VERSION_IN_PROGRESS',
  transitionNotAllowed: 'DOC_TRANSITION_NOT_ALLOWED',
  selfApproval: 'DOC_SELF_APPROVAL',
  sourceInvalid: 'DOC_SOURCE_INVALID',
  pdfNotReady: 'DOC_PDF_NOT_READY',
  integrityFailed: 'DOC_INTEGRITY_FAILED',
  linkNotFound: 'DOC_LINK_NOT_FOUND',
  changeRequestNotFound: 'DOC_CHANGE_REQUEST_NOT_FOUND',
  changeRequestRequired: 'DOC_CHANGE_REQUEST_REQUIRED',
  changeRequestInvalid: 'DOC_CHANGE_REQUEST_INVALID',
  selfDecision: 'DOC_SELF_DECISION',
  notAcknowledgeable: 'DOC_NOT_ACKNOWLEDGEABLE',
  formTemplateNotFound: 'DOC_FORM_TEMPLATE_NOT_FOUND',
  formTemplateNotEditable: 'DOC_FORM_TEMPLATE_NOT_EDITABLE',
  formRecordNotFound: 'DOC_FORM_RECORD_NOT_FOUND',
  formRecordNotEditable: 'DOC_FORM_RECORD_NOT_EDITABLE',
  formDataInvalid: 'DOC_FORM_DATA_INVALID',
  outputTemplateNotFound: 'DOC_OUTPUT_TEMPLATE_NOT_FOUND',
  outputTemplateNotEditable: 'DOC_OUTPUT_TEMPLATE_NOT_EDITABLE',
  outputTemplateInvalid: 'DOC_OUTPUT_TEMPLATE_INVALID',
  checklistRequired: 'DOC_CHECKLIST_REQUIRED',
  retentionRuleNotFound: 'DOC_RETENTION_RULE_NOT_FOUND',
  retentionRuleConflict: 'DOC_RETENTION_RULE_CONFLICT',
  dispositionNotFound: 'DOC_DISPOSITION_NOT_FOUND',
  dispositionNotEditable: 'DOC_DISPOSITION_NOT_EDITABLE',
  selfDisposition: 'DOC_SELF_DISPOSITION',
  documentDisposed: 'DOC_DOCUMENT_DISPOSED',
} as const;

/**
 * Clasificación (numeral 15.4). Confidencial: cada descarga queda en el registro de accesos.
 * Restringido: además del rol exige el permiso nominal «Ver documentos restringidos», y cada
 * consulta queda registrada.
 */
export const CLASSIFICATIONS = {
  public: 'Público',
  internal: 'Interno',
  confidential: 'Confidencial',
  restricted: 'Restringido',
} as const;

export type Classification = keyof typeof CLASSIFICATIONS;

export const classificationSchema = z
  .enum(Object.keys(CLASSIFICATIONS) as [Classification, ...Classification[]])
  .describe('Público, interno, confidencial o restringido');

/** La clasificación exige registrar las descargas (confidencial y restringido). */
export function isLoggedClassification(classification: Classification): boolean {
  return classification === 'confidential' || classification === 'restricted';
}

export const folderKindSchema = z
  .enum(['folder', 'case_file'])
  .describe('Carpeta o expediente de un registro');

export const caseFileEntitySchema = z.enum(['party']).describe('Registro del expediente: tercero');

export type FolderKind = z.infer<typeof folderKindSchema>;

const folderName = z.string().trim().min(2).max(120);

export const folderSchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable(),
  code: z.string().nullable().describe('Código de las carpetas que crea el sistema'),
  name: z.string(),
  kind: folderKindSchema,
  entity_type: caseFileEntitySchema.nullable(),
  entity_id: z.uuid().nullable(),
  entity_name: z.string().nullable().describe('Nombre del registro del expediente'),
  classification: classificationSchema.describe('Clasificación sugerida para sus documentos'),
  document_count: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const folderListResponseSchema = z.object({
  data: z.array(folderSchema).describe('Todas las carpetas, en orden de nombre'),
});

export const createFolderRequestSchema = z
  .strictObject({
    parent_id: z.uuid().nullable().describe('Carpeta que la contiene; null en la raíz'),
    name: folderName,
    kind: folderKindSchema.default('folder'),
    entity_type: caseFileEntitySchema.nullable().default(null),
    entity_id: z.uuid().nullable().default(null),
    classification: classificationSchema.default('internal'),
  })
  .superRefine((value, context) => {
    const hasEntity = value.entity_type !== null && value.entity_id !== null;
    if ((value.kind === 'case_file') !== hasEntity) {
      const message = 'Un expediente se liga a un tercero; una carpeta, a ninguno.';
      context.addIssue({ code: 'custom', path: ['entity_id'], message });
    }
  });

export const updateFolderRequestSchema = z.strictObject({
  name: folderName,
  classification: classificationSchema,
});

export type Folder = z.infer<typeof folderSchema>;
export type FolderListResponse = z.infer<typeof folderListResponseSchema>;
export type CreateFolderRequest = z.infer<typeof createFolderRequestSchema>;
export type UpdateFolderRequest = z.infer<typeof updateFolderRequestSchema>;
