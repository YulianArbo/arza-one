import { z } from 'zod';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeUsersWithRoles, noticeRecipients } from '../../iam/index.js';
import { taskNoticeFacts } from '../../wf/index.js';
import { bogotaDateTime } from '../domain/bogota-time.js';
import { excerpt } from '../domain/delivery-rules.js';
import { CONTRACT_HANDLERS } from './contract-notices.js';
import { HR_HANDLERS } from './hr-notices.js';
import { HR_PEOPLE_HANDLERS } from './hr-people-notices.js';
import { QMS_HANDLERS } from './qms-notices.js';
import { SST_HANDLERS } from './sst-notices.js';
import type { Handler, Notice } from './notice-types.js';
import { PROJECT_HANDLERS } from './project-notices.js';
import { SERVICE_HANDLERS } from './service-notices.js';

export type { Notice } from './notice-types.js';

// Qué avisos produce cada evento de la bandeja de salida (numeral 13.3). Un evento sin avisos se
// publica igual: los demás módulos que lo consuman llegarán en sus bloques.

/** Roles que reciben las alertas de seguridad: responsable técnico y Dirección (numeral 13.3). */
const SECURITY_ALERT_ROLES = ['ADMIN_PLATAFORMA', 'DIRECCION'] as const;

const SECURITY_ALERT_LABELS: Readonly<Record<string, string>> = {
  'iam.account.locked': 'una cuenta se bloqueó por intentos fallidos',
  'iam.account.locked_by_admin': 'un administrador bloqueó una cuenta',
  'iam.sessions.revoked': 'se cerraron las sesiones de una persona',
  'iam.sessions.revoked_all': 'se cerraron todas las sesiones de la empresa',
  'iam.permissions.changed': 'cambiaron los permisos de un rol o de una persona',
  'iam.mfa.reset': 'se reinició el segundo factor de una persona',
  'iam.mfa.disabled': 'una persona desactivó su segundo factor',
  'iam.mfa.failures': 'hubo varios códigos de segundo factor incorrectos seguidos',
};

const taskAssignedSchema = z.object({ task_id: z.uuid(), assignee_id: z.uuid().nullable() });
const taskEscalatedSchema = z.object({ task_id: z.uuid(), escalated_to_id: z.uuid().nullable() });
const mentionSchema = z.object({
  comment_id: z.uuid(),
  author_id: z.uuid(),
  mention_ids: z.array(z.uuid()),
  record_label: z.string(),
  link: z.string(),
});
const securityAlertSchema = z.object({ type: z.string() });

async function taskNotices(
  tx: TenantTransaction,
  kind: 'task_assigned' | 'task_escalated',
  taskId: string,
  userId: string | null,
): Promise<Notice[]> {
  const task = await taskNoticeFacts(tx, taskId);
  if (task === null || userId === null) return [];
  const vence = task.dueAt === null ? 'sin vencimiento' : bogotaDateTime(task.dueAt);
  return [
    { userId, kind, values: { tarea: task.title, vence }, link: `/app/mis-tareas/${taskId}` },
  ];
}

const onTaskAssigned: Handler = async (tx, event) => {
  const payload = taskAssignedSchema.parse(event.payload);
  // Quien se asigna una tarea a sí mismo ya lo sabe.
  const assignee = payload.assignee_id === event.actorId ? null : payload.assignee_id;
  return taskNotices(tx, 'task_assigned', payload.task_id, assignee);
};

const onTaskEscalated: Handler = async (tx, event) => {
  const payload = taskEscalatedSchema.parse(event.payload);
  return taskNotices(tx, 'task_escalated', payload.task_id, payload.escalated_to_id);
};

const onMention: Handler = async (tx, event) => {
  const payload = mentionSchema.parse(event.payload);
  const [comment, [author]] = await Promise.all([
    tx.comment.findFirst({ where: { id: payload.comment_id, deletedAt: null } }),
    noticeRecipients(tx, [payload.author_id]),
  ]);
  if (comment === null) return [];
  const values = {
    autor: author?.displayName ?? author?.email ?? 'Un colaborador',
    registro: payload.record_label,
    comentario: excerpt(comment.body),
  };
  return payload.mention_ids.map((userId) => ({
    userId,
    kind: 'comment_mention',
    values,
    link: payload.link,
  }));
};

const onSecurityAlert: Handler = async (tx, event, now) => {
  const { type } = securityAlertSchema.parse(event.payload);
  const users = await activeUsersWithRoles(tx, SECURITY_ALERT_ROLES, now);
  const values = {
    alerta: SECURITY_ALERT_LABELS[type] ?? 'un evento de seguridad',
    fecha: bogotaDateTime(event.occurredAt),
  };
  return users.map((userId) => ({
    userId,
    kind: 'security_alert',
    values,
    link: '/app/auditoria/seguridad',
  }));
};

const readingRequestedSchema = z.object({
  document_id: z.uuid(),
  code: z.string(),
  version_label: z.string(),
  user_ids: z.array(z.uuid()),
});
const requestDecidedSchema = z.object({
  request_id: z.uuid(),
  code: z.string(),
  requester_id: z.uuid(),
  outcome: z.enum(['approved', 'rejected']),
});

/** B19: a cada persona de los cargos destinatarios se le pide leer la versión publicada. */
const onReadingRequested: Handler = (_tx, event) => {
  const payload = readingRequestedSchema.parse(event.payload);
  const values = { documento: payload.code, version: payload.version_label };
  const link = `/app/documentos/${payload.document_id}`;
  const notices = payload.user_ids.map((userId): Notice => ({
    userId,
    kind: 'doc_read_requested',
    values,
    link,
  }));
  return Promise.resolve(notices);
};

/** B19: quien pidió el cambio documental sabe si se aprobó o se rechazó. */
const onRequestDecided: Handler = (_tx, event) => {
  const payload = requestDecidedSchema.parse(event.payload);
  const decision = payload.outcome === 'approved' ? 'aprobada' : 'rechazada';
  const notice: Notice = {
    userId: payload.requester_id,
    kind: 'doc_request_decided',
    values: { solicitud: payload.code, decision },
    link: `/app/documentos/solicitudes/${payload.request_id}`,
  };
  return Promise.resolve([notice]);
};

const activityReminderSchema = z.object({
  assignee_id: z.uuid(),
  subject: z.string(),
  record_code: z.string(),
  due_at: z.iso.datetime({ offset: true }),
});

/** B22: el responsable de una actividad comercial recibe su recordatorio 30 minutos antes. */
const onActivityReminder: Handler = (_tx, event) => {
  const payload = activityReminderSchema.parse(event.payload);
  const notice: Notice = {
    userId: payload.assignee_id,
    kind: 'crm_activity_due',
    values: {
      actividad: payload.subject,
      registro: payload.record_code,
      hora: bogotaDateTime(new Date(payload.due_at)),
    },
    link: '/app/comercial/actividades',
  };
  return Promise.resolve([notice]);
};

const quoteUpdateSchema = z.object({
  id: z.uuid(),
  author_id: z.uuid().nullable(),
  code: z.string(),
  version_number: z.number().int().positive(),
});

/** Lo que se le cuenta a quien elaboró la cotización, por evento. */
const QUOTE_UPDATES: Readonly<Record<string, string>> = {
  'crm.quote.approved': 'la Dirección la aprobó y ya puede enviarla',
  'crm.quote.returned': 'la Dirección la devolvió para corregir',
  'crm.quote.accepted': 'el cliente la aceptó; ya puede crear el contrato',
  'crm.quote.rejected': 'el cliente la rechazó',
  'crm.quote.expired': 'venció sin respuesta del cliente',
};

/** B23: quien elaboró la cotización se entera de lo que otros decidieron sobre ella. */
const onQuoteUpdate: Handler = (_tx, event) => {
  const payload = quoteUpdateSchema.parse(event.payload);
  const update = QUOTE_UPDATES[event.eventType];
  if (payload.author_id === null || payload.author_id === event.actorId || update === undefined) {
    return Promise.resolve([]);
  }
  const notice: Notice = {
    userId: payload.author_id,
    kind: 'crm_quote_update',
    values: { cotizacion: `${payload.code} v${String(payload.version_number)}`, novedad: update },
    // Aceptada, el aviso lleva al asistente del contrato ya diligenciado (B24, numeral 13.3).
    link:
      event.eventType === 'crm.quote.accepted'
        ? `/app/contratos/nuevo?cotizacion=${payload.id}`
        : `/app/comercial/cotizaciones/${payload.id}`,
  };
  return Promise.resolve([notice]);
};

const HANDLERS: Readonly<Record<string, Handler>> = {
  'wf.task.assigned': onTaskAssigned,
  'wf.task.escalated': onTaskEscalated,
  'comment.mentioned': onMention,
  'security.alert': onSecurityAlert,
  'doc.acknowledgement.requested': onReadingRequested,
  'doc.request.decided': onRequestDecided,
  'crm.activity.reminder': onActivityReminder,
  ...Object.fromEntries(Object.keys(QUOTE_UPDATES).map((type) => [type, onQuoteUpdate])),
  ...CONTRACT_HANDLERS,
  ...PROJECT_HANDLERS,
  ...SERVICE_HANDLERS,
  ...HR_HANDLERS,
  ...HR_PEOPLE_HANDLERS,
  ...SST_HANDLERS,
  ...QMS_HANDLERS,
};

/** Los avisos que produce el evento; ninguno si nadie se ocupa de él. */
export async function noticesFor(
  tx: TenantTransaction,
  event: OutboxEvent,
  now: Date,
): Promise<Notice[]> {
  const handler = HANDLERS[event.eventType];
  return handler === undefined ? [] : handler(tx, event, now);
}
