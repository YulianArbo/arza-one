// Datos ficticios de las pruebas de avisos, comentarios y adjuntos (B16). Ninguno es real.

import type {
  Attachment,
  Comment,
  FileView,
  MyPermissionsResponse,
  Notification,
  NotificationPreferences,
  NotificationTemplate,
  PermissionCode,
} from '@arza/contracts';

import { SESSION } from './fake-api';

export const NOTICE_ID = '01999a00-0000-7000-8000-0000000f0001';
export const PARTY_ID = '01999a00-0000-7000-8000-0000000f0002';
export const COMMENT_ID = '01999a00-0000-7000-8000-0000000f0003';
export const ATTACHMENT_ID = '01999a00-0000-7000-8000-0000000f0004';
export const FILE_ID = '01999a00-0000-7000-8000-0000000f0005';

const ANA = { id: SESSION.user.id, email: 'ana@demo-uno.test', display_name: 'Ana Pérez' };
const LUIS = {
  id: '01999a00-0000-7000-8000-00000000a002',
  email: 'luis@demo-uno.test',
  display_name: 'Luis Gómez',
};

export function permissions(codes: readonly PermissionCode[]): MyPermissionsResponse {
  return {
    roles: [
      { id: '01999a00-0000-7000-8000-00000000c013', code: 'ADMIN_FINANCIERO', name: 'Finanzas' },
    ],
    permissions: codes.map((code) => ({ code, scope: 'all' as const })),
  };
}

export function notice(overrides: Partial<Notification> = {}): Notification {
  return {
    id: NOTICE_ID,
    kind: 'task_assigned',
    title: 'Nueva tarea: Revisar la cotización',
    body: 'Le asignaron la tarea «Revisar la cotización». Vence: 16/10/2026, 4:00 p. m.',
    link: '/app/mis-tareas/01999a00-0000-7000-8000-0000000e0001',
    delivered_at: '2026-10-13T14:30:00.000Z',
    read_at: null,
    ...overrides,
  };
}

export const PREFERENCES: NotificationPreferences = {
  items: [
    { kind: 'task_assigned', label: 'Le asignaron una tarea', email: true, urgent: false },
    {
      kind: 'task_escalated',
      label: 'Se le escaló una tarea vencida',
      email: false,
      urgent: false,
    },
    {
      kind: 'comment_mention',
      label: 'Lo mencionaron en un comentario',
      email: true,
      urgent: false,
    },
    { kind: 'security_alert', label: 'Alerta de seguridad', email: true, urgent: true },
  ],
};

export function template(overrides: Partial<NotificationTemplate> = {}): NotificationTemplate {
  return {
    kind: 'task_assigned',
    label: 'Le asignaron una tarea',
    variables: ['nombre', 'tarea', 'vence'],
    subject: 'Nueva tarea: {{tarea}}',
    body: 'Le asignaron la tarea «{{tarea}}». Vence: {{vence}}.',
    urgent: false,
    version: 2,
    updated_at: '2026-10-13T14:30:00.000Z',
    ...overrides,
  };
}

export function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: COMMENT_ID,
    body: 'Revisé el RUT y está al día.',
    author: ANA,
    mentions: [LUIS],
    created_at: '2026-10-13T14:30:00.000Z',
    can_delete: true,
    ...overrides,
  };
}

export function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: ATTACHMENT_ID,
    label: 'RUT 2026',
    file: { id: FILE_ID, file_name: 'rut.pdf', mime_type: 'application/pdf', size_bytes: 120_000 },
    created_by: LUIS,
    created_at: '2026-10-13T14:30:00.000Z',
    can_delete: false,
    ...overrides,
  };
}

export function availableFile(): FileView {
  return {
    id: FILE_ID,
    file_name: 'camara.pdf',
    mime_type: 'application/pdf',
    size_bytes: 3000,
    sha256: 'a'.repeat(64),
    status: 'available',
    rejection: null,
    created_at: '2026-10-13T14:30:00.000Z',
  };
}
