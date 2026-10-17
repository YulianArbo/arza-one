import { z } from 'zod';

import { documentTypeSchema, processProblem } from './documents.js';

// Contratos de la Solicitud de Acción Documental (M03, B19; FT-SGC-001, ficha 17.4): pedir que se
// cree, modifique o elimine un documento del SGC. Radicada → en análisis → aprobada o rechazada →
// ejecutada. El trámite lo lleva el motor de flujos; quien la pide nunca la decide.

const dateTime = z.iso.datetime({ offset: true });

export const CHANGE_REQUEST_ACTIONS = {
  create: 'Creación',
  update: 'Modificación',
  obsolete: 'Eliminación',
} as const;

export const CHANGE_REQUEST_STATUSES = {
  filed: 'Radicada',
  in_analysis: 'En análisis',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  executed: 'Ejecutada',
} as const;

export type ChangeRequestAction = keyof typeof CHANGE_REQUEST_ACTIONS;
export type ChangeRequestStatus = keyof typeof CHANGE_REQUEST_STATUSES;

export const changeRequestActionSchema = z
  .enum(Object.keys(CHANGE_REQUEST_ACTIONS) as [ChangeRequestAction, ...ChangeRequestAction[]])
  .describe('Crear, modificar o eliminar (declarar obsoleto) un documento');

export const changeRequestStatusSchema = z
  .enum(Object.keys(CHANGE_REQUEST_STATUSES) as [ChangeRequestStatus, ...ChangeRequestStatus[]])
  .describe('Radicada, en análisis, aprobada, rechazada o ejecutada');

/** Código de la solicitud: SAD-2026-0001. */
export const changeRequestCodeSchema = z.string().regex(/^SAD-\d{4}-\d{4,8}$/u);

const person = z.object({ id: z.uuid(), name: z.string() });

export const changeRequestSchema = z.object({
  id: z.uuid(),
  code: changeRequestCodeSchema,
  action: changeRequestActionSchema,
  status: changeRequestStatusSchema,
  title: z.string().describe('Documento pedido o afectado'),
  justification: z.string(),
  document: z
    .object({ id: z.uuid(), code: z.string(), title: z.string() })
    .nullable()
    .describe('El documento afectado; en una creación, el que se creó'),
  doc_type: z.string().nullable().describe('Tipo del documento nuevo (solo en una creación)'),
  process: z
    .object({ id: z.uuid(), code: z.string(), name: z.string() })
    .nullable()
    .describe('Proceso del documento nuevo (solo en una creación)'),
  requested_by: person.nullable(),
  requested_at: dateTime,
  decided_by: person.nullable(),
  decided_at: dateTime.nullable(),
  decision_note: z.string().nullable(),
  executed_at: dateTime.nullable(),
  workflow_instance_id: z.uuid().nullable().describe('Trámite en el motor de flujos'),
  version: z.number().int().positive(),
});

export const changeRequestListQuerySchema = z.strictObject({
  status: changeRequestStatusSchema.optional(),
  document_id: z.uuid().optional(),
  usable: z
    .enum(['create', 'update', 'obsolete'])
    .optional()
    .describe('Solo las aprobadas, sin ejecutar, que la persona puede usar para esa acción'),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const changeRequestListResponseSchema = z.object({
  data: z.array(changeRequestSchema).describe('De la más reciente a la más antigua'),
  next_cursor: z.uuid().nullable(),
});

export const createChangeRequestSchema = z
  .strictObject({
    action: changeRequestActionSchema,
    document_id: z.uuid().nullable().describe('Documento que se modifica o elimina'),
    doc_type: documentTypeSchema.nullable().describe('Tipo del documento que se crea'),
    process_id: z.uuid().nullable().describe('Proceso del documento que se crea'),
    title: z.string().trim().min(3).max(200).nullable().describe('Nombre del documento nuevo'),
    justification: z.string().trim().min(10).max(2000).describe('Por qué se pide el cambio'),
  })
  .superRefine((value, context) => {
    const creates = value.action === 'create';
    const issue = (path: string, message: string) => {
      context.addIssue({ code: 'custom', path: [path], message });
    };
    if (creates && value.doc_type === null) issue('doc_type', 'Elija el tipo del documento.');
    const process =
      creates && value.doc_type !== null ? processProblem(value.doc_type, value.process_id) : null;
    if (process !== null) issue('process_id', process);
    if (creates && value.title === null) issue('title', 'Escriba el nombre del documento.');
    if (!creates && value.document_id === null) issue('document_id', 'Elija el documento.');
  });

export type ChangeRequest = z.infer<typeof changeRequestSchema>;
export type ChangeRequestListQuery = z.infer<typeof changeRequestListQuerySchema>;
export type ChangeRequestListResponse = z.infer<typeof changeRequestListResponseSchema>;
export type CreateChangeRequest = z.infer<typeof createChangeRequestSchema>;
