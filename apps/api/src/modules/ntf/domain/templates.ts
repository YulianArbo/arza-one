import { NOTIFICATION_KINDS, templateVariables, type NotificationKind } from '@arza/contracts';

// Plantillas de los avisos (B16): asunto y texto con datos entre llaves dobles. El marco
// institucional (saludo, botón y firma) lo pone @arza/templates al enviar el correo.

export interface TemplateText {
  readonly subject: string;
  readonly body: string;
  readonly urgent: boolean;
}

/** Plantillas con las que nace cada empresa. Administración › Plantillas las cambia. */
export const DEFAULT_TEMPLATES: Readonly<Record<NotificationKind, TemplateText>> = {
  task_assigned: {
    subject: 'Nueva tarea: {{tarea}}',
    body: 'Le asignaron la tarea «{{tarea}}». Vence: {{vence}}.',
    urgent: false,
  },
  task_escalated: {
    subject: 'Tarea vencida escalada a usted: {{tarea}}',
    body: 'La tarea «{{tarea}}» venció ({{vence}}) y se le escaló como jefe inmediato de quien la tenía.',
    urgent: false,
  },
  comment_mention: {
    subject: '{{autor}} lo mencionó en {{registro}}',
    body: '{{autor}} lo mencionó en un comentario sobre {{registro}}: «{{comentario}}»',
    urgent: false,
  },
  security_alert: {
    subject: 'Alerta de seguridad en ARZA ONE: {{alerta}}',
    body: 'Se registró una alerta de seguridad el {{fecha}} (hora de Colombia): {{alerta}}. Revísela en la auditoría de seguridad.',
    urgent: true,
  },
};

/** Variables que el texto usa y que este tipo de aviso no ofrece. */
export function unknownVariables(kind: NotificationKind, texts: readonly string[]): string[] {
  const allowed: readonly string[] = NOTIFICATION_KINDS[kind].variables;
  const used = texts.flatMap(templateVariables);
  return [...new Set(used.filter((name) => !allowed.includes(name)))];
}

/** Reemplaza cada {{variable}} por su valor; una variable sin valor queda vacía. */
export function fillTemplate(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => values[name] ?? '');
}
