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
  doc_read_requested: {
    subject: 'Lea el documento {{documento}}',
    body: 'Se publicó la versión {{version}} del documento {{documento}}. Léalo y confirme su lectura en ARZA ONE.',
    urgent: false,
  },
  doc_request_decided: {
    subject: 'Su solicitud documental {{solicitud}} fue {{decision}}',
    body: 'La Solicitud de Acción Documental {{solicitud}} fue {{decision}}. Revise el detalle en ARZA ONE.',
    urgent: false,
  },
  // B22: no es urgente, para respetar la desconexión laboral; fuera de la jornada llega al empezarla.
  crm_activity_due: {
    subject: 'Recordatorio: {{actividad}} ({{hora}})',
    body: 'Tiene programada la actividad «{{actividad}}» de {{registro}} para el {{hora}} (hora de Colombia). Revísela en ARZA ONE › Comercial › Actividades.',
    urgent: false,
  },
  // B23: a quien elaboró la cotización, cuando la Dirección decide o el cliente responde.
  crm_quote_update: {
    subject: 'Cotización {{cotizacion}}: {{novedad}}',
    body: 'Su cotización {{cotizacion}} tiene una novedad: {{novedad}}. Revísela en ARZA ONE › Comercial › Cotizaciones.',
    urgent: false,
  },
  // B24: a quien elaboró el contrato o lo tiene a cargo: decisiones, vencimientos y obligaciones.
  ctr_contract_update: {
    subject: 'Contrato {{contrato}}: {{novedad}}',
    body: 'El contrato {{contrato}} tiene una novedad: {{novedad}}. Revíselo en ARZA ONE › Contratos.',
    urgent: false,
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
