import { z } from 'zod';

import { requiredText } from '../contract/common.js';
import { dateTimeSchema, personRefSchema } from '../crm/common.js';

// Lo que el equipo deja ver al cliente en el portal (B30, decisiones 2 y 5): si el proyecto se ve
// en el portal y los archivos que se comparten a propósito. Nada se comparte por defecto.

export const projectPortalRequestSchema = z.strictObject({
  visible: z.boolean().describe('El proyecto se ve en el portal del cliente desde que inicia'),
});

export const shareFileRequestSchema = z.strictObject({
  file_id: z.uuid().describe('Archivo ya cargado y revisado por el antivirus'),
  title: requiredText(3, 160, 'Escriba cómo lo verá el cliente.'),
});

export const sharedFileSchema = z.object({
  id: z.uuid(),
  file_id: z.uuid(),
  title: z.string(),
  shared_by: personRefSchema.nullable(),
  shared_at: dateTimeSchema,
});

export const sharedFileListSchema = z.object({
  visible: z.boolean().describe('El proyecto se ve en el portal'),
  data: z.array(sharedFileSchema),
  can_share: z.boolean(),
});

export type ProjectPortalRequest = z.infer<typeof projectPortalRequestSchema>;
export type ShareFileRequest = z.infer<typeof shareFileRequestSchema>;
export type SharedFile = z.infer<typeof sharedFileSchema>;
export type SharedFileList = z.infer<typeof sharedFileListSchema>;
