import { z } from 'zod';

import { allowedFileTypeSchema } from '../doc/files.js';
import { emailSchema } from '../iam/auth.js';

// Contratos de los comentarios con menciones y los adjuntos de cualquier registro (M04, B16;
// ficha 17.5). Quien puede ver el registro ve sus comentarios y adjuntos; para escribir, además,
// debe poder trabajar en él. Por ahora todos son internos: lo visible al cliente llega con el portal.

const dateTime = z.iso.datetime({ offset: true });

/** Registros que admiten comentarios y adjuntos. Cada módulo nuevo agrega el suyo. */
export const commentableEntityTypeSchema = z
  .enum(['party', 'wf_instance', 'ctr_contract'])
  .describe('Tercero, trámite o contrato');

export type CommentableEntityType = z.infer<typeof commentableEntityTypeSchema>;

export const recordRefSchema = z.object({
  entity_type: commentableEntityTypeSchema,
  entity_id: z.uuid(),
});

export type RecordRef = z.infer<typeof recordRefSchema>;

const personSchema = z.object({
  id: z.uuid(),
  display_name: z.string().nullable(),
  email: z.email(),
});

/** Máximo de personas mencionadas en un comentario. */
export const MAX_MENTIONS = 10;

export const commentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  author: personSchema.nullable(),
  mentions: z.array(personSchema),
  created_at: dateTime,
  can_delete: z.boolean().describe('Solo quien lo escribió puede retirarlo'),
});

export type Comment = z.infer<typeof commentSchema>;

export const commentListSchema = z.object({ items: z.array(commentSchema) });

export type CommentList = z.infer<typeof commentListSchema>;

export const createCommentRequestSchema = recordRefSchema.extend({
  body: z.string().trim().min(1).max(4000),
  mention_emails: z
    .array(emailSchema)
    .max(MAX_MENTIONS)
    .default([])
    .describe('Correos de los colaboradores mencionados; cada uno recibe un aviso'),
});

export type CreateCommentRequest = z.input<typeof createCommentRequestSchema>;

export const attachmentSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  file: z.object({
    id: z.uuid(),
    file_name: z.string(),
    mime_type: allowedFileTypeSchema,
    size_bytes: z.number().int().positive(),
  }),
  created_by: personSchema.nullable(),
  created_at: dateTime,
  can_delete: z.boolean().describe('Solo quien lo adjuntó puede retirarlo'),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentListSchema = z.object({ items: z.array(attachmentSchema) });

export type AttachmentList = z.infer<typeof attachmentListSchema>;

export const createAttachmentRequestSchema = recordRefSchema.extend({
  file_id: z.uuid().describe('Archivo que usted subió y que ya pasó el antivirus'),
  label: z.string().trim().min(1).max(120),
});

export type CreateAttachmentRequest = z.infer<typeof createAttachmentRequestSchema>;
