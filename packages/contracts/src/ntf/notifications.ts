import { z } from 'zod';

// Contratos de los avisos (M04, B16; ficha 17.5): centro de avisos, preferencias por persona y
// plantillas institucionales de correo. Los avisos no urgentes a colaboradores fuera de la jornada
// se entregan al inicio de la siguiente (PT-GTH-001, Ley 2191 de 2022).

export const NTF_ERROR_CODES = {
  notificationNotFound: 'NTF_NOTIFICATION_NOT_FOUND',
  templateNotFound: 'NTF_TEMPLATE_NOT_FOUND',
  templateInvalid: 'NTF_TEMPLATE_INVALID',
  recordNotFound: 'NTF_RECORD_NOT_FOUND',
  commentNotFound: 'NTF_COMMENT_NOT_FOUND',
  attachmentNotFound: 'NTF_ATTACHMENT_NOT_FOUND',
  mentionInvalid: 'NTF_MENTION_INVALID',
  fileNotAttachable: 'NTF_FILE_NOT_ATTACHABLE',
} as const;

const dateTime = z.iso.datetime({ offset: true });

/**
 * Tipos de aviso: cada uno tiene su plantilla y su preferencia. Las variables son las que la
 * plantilla puede usar entre llaves dobles, como {{tarea}}.
 */
export const NOTIFICATION_KINDS = {
  task_assigned: {
    label: 'Le asignaron una tarea',
    variables: ['nombre', 'tarea', 'vence'],
  },
  task_escalated: {
    label: 'Se le escaló una tarea vencida',
    variables: ['nombre', 'tarea', 'vence'],
  },
  comment_mention: {
    label: 'Lo mencionaron en un comentario',
    variables: ['nombre', 'autor', 'registro', 'comentario'],
  },
  security_alert: {
    label: 'Alerta de seguridad',
    variables: ['nombre', 'alerta', 'fecha'],
  },
  doc_read_requested: {
    label: 'Le pidieron leer un documento',
    variables: ['nombre', 'documento', 'version'],
  },
  doc_request_decided: {
    label: 'Se decidió su solicitud documental',
    variables: ['nombre', 'solicitud', 'decision'],
  },
  crm_activity_due: {
    label: 'Se acerca una actividad comercial',
    variables: ['nombre', 'actividad', 'registro', 'hora'],
  },
  crm_quote_update: {
    label: 'Novedad de una cotización suya',
    variables: ['nombre', 'cotizacion', 'novedad'],
  },
  ctr_contract_update: {
    label: 'Novedad de un contrato a su cargo',
    variables: ['nombre', 'contrato', 'novedad'],
  },
  prj_project_update: {
    label: 'Novedad de un proyecto suyo',
    variables: ['nombre', 'proyecto', 'novedad'],
  },
  svc_ticket_update: {
    label: 'Novedad de un tiquete de la mesa de ayuda',
    variables: ['nombre', 'tiquete', 'novedad'],
  },
  svc_ticket_alert: {
    label: 'Alerta de plazo o tiquete crítico',
    variables: ['nombre', 'tiquete', 'novedad'],
  },
  svc_pqrsf_update: {
    label: 'Novedad o plazo de una PQRSF',
    variables: ['nombre', 'pqrsf', 'novedad'],
  },
} as const satisfies Record<string, { label: string; variables: readonly string[] }>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

/** Los tipos de aviso, en el orden en que se muestran. */
export const NOTIFICATION_KIND_KEYS = Object.keys(NOTIFICATION_KINDS) as [
  NotificationKind,
  ...NotificationKind[],
];

export const notificationKindSchema = z.enum(NOTIFICATION_KIND_KEYS).describe('Tipo de aviso');

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable().describe('Ruta de la aplicación a la que lleva el aviso'),
  delivered_at: dateTime.describe('Cuándo se entregó; fuera de jornada, al iniciar la siguiente'),
  read_at: dateTime.nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .describe('Solo los no leídos'),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema).describe('Los más recientes primero'),
  unread_count: z.number().int().nonnegative(),
});

export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const notificationPreferenceSchema = z.object({
  kind: notificationKindSchema,
  label: z.string(),
  email: z.boolean().describe('Recibir también por correo'),
  urgent: z.boolean().describe('Urgente: se entrega al instante y siempre por correo'),
});

export const notificationPreferencesSchema = z.object({
  items: z.array(notificationPreferenceSchema),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesRequestSchema = z.object({
  items: z
    .array(z.object({ kind: notificationKindSchema, email: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_KIND_KEYS.length),
});

export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;

export const notificationTemplateSchema = z.object({
  kind: notificationKindSchema,
  label: z.string(),
  variables: z.array(z.string()).describe('Datos que puede usar entre llaves dobles'),
  subject: z.string(),
  body: z.string(),
  urgent: z.boolean().describe('Excepción al envío diferido (PT-GTH-001)'),
  version: z.number().int().positive().describe('Versión vigente, para la cabecera If-Match'),
  updated_at: dateTime,
});

export type NotificationTemplate = z.infer<typeof notificationTemplateSchema>;

export const notificationTemplateListSchema = z.object({
  items: z.array(notificationTemplateSchema),
});

export const updateNotificationTemplateRequestSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  body: z.string().trim().min(10).max(2000),
  urgent: z.boolean(),
});

export type UpdateNotificationTemplateRequest = z.infer<
  typeof updateNotificationTemplateRequestSchema
>;

/** Variables entre llaves dobles que usa un texto: «Hola {{nombre}}» → ['nombre']. */
export function templateVariables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? '');
}
