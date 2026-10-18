import { z } from 'zod';

import { versionContentFields, versionStatusSchema } from './documents.js';
import { allowedFileTypeSchema, type AllowedFileType } from './files.js';
import { classificationSchema } from './folders.js';

// Contratos de las versiones (M03, B18; ficha 17.4): borrador → en revisión → aprobada →
// vigente → obsoleta. Solo hay una vigente por documento; fuera del borrador nada cambia. Desde B19
// la versión nueva de un documento del SGC nace de una Solicitud de Acción Documental aprobada y
// su revisión, aprobación y publicación son pasos de un trámite del motor de flujos.

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date();

/** Tipos que se aceptan como archivo fuente de una versión; Word y Excel se convierten a PDF. */
export const VERSION_SOURCE_TYPES: readonly AllowedFileType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const renderStatusSchema = z
  .enum(['pending', 'ready', 'failed'])
  .describe('Conversión a PDF: en curso, lista o fallida');

export const versionActionSchema = z
  .enum(['edit', 'submit', 'reject', 'approve', 'publish', 'obsolete'])
  .describe('Paso que la persona puede dar sobre la versión');

export const versionOriginSchema = z
  .enum(['platform', 'import'])
  .describe('Elaborada en la plataforma o traída en la carga inicial del Listado Maestro');

export type VersionAction = z.infer<typeof versionActionSchema>;
export type VersionOrigin = z.infer<typeof versionOriginSchema>;
export type RenderStatus = z.infer<typeof renderStatusSchema>;

const versionFile = z.object({
  id: z.uuid(),
  file_name: z.string(),
  mime_type: allowedFileTypeSchema,
  size_bytes: z.number().int().positive(),
  sha256: z.string().nullable(),
});

const person = z.object({ id: z.uuid(), name: z.string() }).nullable();

export const versionSchema = z.object({
  id: z.uuid(),
  document_id: z.uuid(),
  number: z.number().int().nonnegative(),
  label: z.string().describe('Número de versión: 00, 01…'),
  status: versionStatusSchema,
  render_status: renderStatusSchema,
  title: z.string(),
  classification: classificationSchema,
  owner_position: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  change_summary: z.string(),
  review_note: z.string().nullable().describe('Motivo de la última devolución'),
  source_file: versionFile.nullable().describe('Solo para quien edita documentos'),
  pdf_file: versionFile.nullable(),
  created_by: person.describe('Quien elaboró la versión'),
  created_at: dateTime,
  submitted_at: dateTime.nullable(),
  approved_by: person,
  approved_at: dateTime.nullable(),
  effective_date: calendarDate.nullable(),
  published_at: dateTime.nullable(),
  obsoleted_at: dateTime.nullable(),
  origin: versionOriginSchema,
  change_request: z
    .object({ id: z.uuid(), code: z.string() })
    .nullable()
    .describe('Solicitud de Acción Documental que la originó'),
  workflow_instance_id: z.uuid().nullable().describe('Trámite de revisión y aprobación'),
  step: z.string().nullable().describe('Paso actual del trámite, como «Aprobación de Dirección»'),
  actions: z.array(versionActionSchema).describe('Pasos que la persona puede dar ahora'),
  version: z.number().int().positive(),
});

export const versionListResponseSchema = z.object({
  data: z.array(versionSchema).describe('Versiones que la persona puede ver, de la más nueva'),
});

const changeRequestId = z
  .uuid()
  .nullable()
  .default(null)
  .describe('Solicitud de Acción Documental aprobada; obligatoria en un documento del SGC');

export const createVersionRequestSchema = z.strictObject({
  ...versionContentFields,
  change_request_id: changeRequestId,
});

export const updateVersionRequestSchema = z.strictObject(versionContentFields);

const note = z.string().trim().min(5).max(1000);

export const rejectVersionRequestSchema = z.strictObject({
  note: note.describe('Qué debe corregir quien elaboró la versión'),
});

export const publishVersionRequestSchema = z.strictObject({
  effective_date: calendarDate.optional().describe('Desde cuándo rige; por defecto, hoy'),
});

export const obsoleteVersionRequestSchema = z.strictObject({
  reason: note.describe('Por qué el documento deja de regir'),
  change_request_id: changeRequestId,
});

export const versionDownloadRequestSchema = z.strictObject({
  file: z.enum(['pdf', 'source']).default('pdf').describe('El PDF o el archivo fuente'),
});

export type Version = z.infer<typeof versionSchema>;
export type VersionListResponse = z.infer<typeof versionListResponseSchema>;
export type CreateVersionRequest = z.infer<typeof createVersionRequestSchema>;
export type UpdateVersionRequest = z.infer<typeof updateVersionRequestSchema>;
export type RejectVersionRequest = z.infer<typeof rejectVersionRequestSchema>;
export type PublishVersionRequest = z.infer<typeof publishVersionRequestSchema>;
export type ObsoleteVersionRequest = z.infer<typeof obsoleteVersionRequestSchema>;
export type VersionDownloadRequest = z.infer<typeof versionDownloadRequestSchema>;
