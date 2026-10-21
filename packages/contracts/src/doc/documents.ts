import { z } from 'zod';

import { classificationSchema } from './folders.js';

// Contratos de los documentos (M03, B18; ficha 17.4). Un documento del SGC lleva el código de
// PR-SGC-001, TIPO-PROCESO-NNN, sin saltos; uno de expediente, DOC-AAAA-NNNN. Nace con su versión
// 00 en borrador y sus datos solo cambian al publicar una versión nueva.

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date();

/**
 * Código de PR-SGC-001 (MN-SGC-001), de un documento controlado sin proceso (RIT-001) o de un
 * documento de expediente (DOC-2026-0001).
 */
export const documentCodeSchema = z
  .string()
  .regex(/^([A-Z]{2,3}-[A-Z]{2,3}-\d{3,8}|[A-Z]{2,3}-\d{3,8}|DOC-\d{4}-\d{4,8})$/u)
  .describe('Código del documento');

/** Tipos del SGC que no pertenecen a un proceso: el Reglamento Interno de Trabajo (B19). */
export const TYPES_WITHOUT_PROCESS: readonly string[] = ['RIT'];

/** Un documento del SGC lleva proceso, salvo los tipos que no pertenecen a uno. */
export function processProblem(docType: string, processId: string | null): string | null {
  const withoutProcess = TYPES_WITHOUT_PROCESS.includes(docType);
  if (withoutProcess && processId !== null) return 'Este tipo de documento no lleva proceso.';
  if (!withoutProcess && processId === null) {
    return 'Un documento del SGC lleva el proceso al que pertenece.';
  }
  return null;
}

/** Código del catálogo «Tipos de documento» (document_types), como PR o PVE. */
export const documentTypeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,3}$/u, 'Tipo inválido')
  .describe('Tipo de documento del catálogo');

export const documentStatusSchema = z
  .enum(['draft', 'current', 'obsolete', 'disposed'])
  .describe('Sin publicar, vigente, obsoleto o eliminado por disposición final (B21)');

export const versionStatusSchema = z
  .enum(['draft', 'in_review', 'approved', 'current', 'obsolete'])
  .describe('Borrador, en revisión, aprobada, vigente u obsoleta');

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type VersionStatus = z.infer<typeof versionStatusSchema>;

const namedReference = z.object({ id: z.uuid(), name: z.string() });

const processReference = z.object({ id: z.uuid(), code: z.string(), name: z.string() });

const versionReference = z.object({
  id: z.uuid(),
  label: z.string().describe('Número de versión: 00, 01…'),
  status: versionStatusSchema,
  effective_date: calendarDate.nullable(),
});

export const documentSchema = z.object({
  id: z.uuid(),
  code: documentCodeSchema,
  title: z.string(),
  doc_type: z.string(),
  doc_type_label: z.string().describe('Nombre del tipo en el catálogo'),
  is_controlled: z.boolean().describe('Documento del SGC con código de PR-SGC-001'),
  process: processReference.nullable(),
  folder_id: z.uuid(),
  classification: classificationSchema,
  owner_position: namedReference.nullable().describe('Cargo responsable'),
  status: documentStatusSchema,
  current_version: versionReference.nullable().describe('Última versión publicada'),
  open_version: versionReference.nullable().describe('Versión en trámite, si la hay'),
  disposed_at: dateTime
    .nullable()
    .describe('Cuándo se eliminó su contenido por disposición final (B21)'),
  created_at: dateTime,
  version: z.number().int().positive(),
});

export const documentListQuerySchema = z.strictObject({
  folder_id: z.uuid().optional(),
  q: z.string().trim().min(2).max(100).optional().describe('Busca en el código y el título'),
  status: documentStatusSchema.optional(),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const documentListResponseSchema = z.object({
  data: z.array(documentSchema).describe('Documentos que la persona puede ver, en orden de código'),
  next_cursor: z.uuid().nullable(),
});

/** Datos que una versión propone y que el documento toma al publicarla. */
export const versionContentFields = {
  title: z.string().trim().min(3).max(200),
  classification: classificationSchema,
  owner_position_id: z.uuid().nullable().describe('Cargo responsable'),
  source_file_id: z.uuid().describe('Archivo fuente: PDF, Word o Excel ya analizado'),
  change_summary: z.string().trim().min(3).max(1000).describe('Qué cambia en esta versión'),
};

export const createDocumentRequestSchema = z
  .strictObject({
    folder_id: z.uuid(),
    doc_type: documentTypeSchema,
    is_controlled: z.boolean().describe('Documento del SGC: lleva proceso y código PR-SGC-001'),
    process_id: z.uuid().nullable(),
    change_request_id: z
      .uuid()
      .nullable()
      .default(null)
      .describe('Solicitud de creación aprobada; obligatoria en un documento del SGC (B19)'),
    ...versionContentFields,
  })
  .superRefine((value, context) => {
    if (!value.is_controlled) return;
    const message = processProblem(value.doc_type, value.process_id);
    if (message !== null) context.addIssue({ code: 'custom', path: ['process_id'], message });
    if (value.change_request_id === null) {
      context.addIssue({
        code: 'custom',
        path: ['change_request_id'],
        message: 'Un documento del SGC se crea desde una solicitud de creación aprobada.',
      });
    }
  });

export type Document = z.infer<typeof documentSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
