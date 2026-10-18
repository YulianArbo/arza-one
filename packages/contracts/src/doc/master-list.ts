import { z } from 'zod';

import { documentStatusSchema } from './documents.js';

// Contratos del Listado Maestro (M03, B19; RE-SGC-001, ficha 17.4): los documentos del SGC con
// código, nombre, tipo, proceso, versión, fecha, estado y responsable, siempre actualizado. La
// exportación tiene las mismas columnas, para conciliarla con el RE-SGC-001.

const calendarDate = z.iso.date();

export const masterListEntrySchema = z.object({
  document_id: z.uuid(),
  code: z.string(),
  title: z.string(),
  doc_type: z.string(),
  doc_type_label: z.string(),
  process: z.object({ id: z.uuid(), code: z.string(), name: z.string() }).nullable(),
  version_label: z.string().nullable().describe('Versión vigente; null si nunca se publicó'),
  effective_date: calendarDate.nullable().describe('Desde cuándo rige la versión vigente'),
  status: documentStatusSchema,
  owner_position: z.string().nullable().describe('Cargo responsable'),
});

export const masterListQuerySchema = z.strictObject({
  process_id: z.uuid().optional(),
  doc_type: z
    .string()
    .regex(/^[A-Z]{2,3}$/u)
    .optional(),
  status: documentStatusSchema.default('current').describe('Por defecto, solo los vigentes'),
  q: z.string().trim().min(2).max(100).optional().describe('Busca en el código y el nombre'),
});

export const masterListResponseSchema = z.object({
  data: z.array(masterListEntrySchema).describe('En orden de código'),
  total: z.number().int().nonnegative(),
});

export type MasterListEntry = z.infer<typeof masterListEntrySchema>;
export type MasterListQuery = z.infer<typeof masterListQuerySchema>;
export type MasterListResponse = z.infer<typeof masterListResponseSchema>;
