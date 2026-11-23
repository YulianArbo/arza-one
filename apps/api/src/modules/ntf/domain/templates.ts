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
  // B26: al líder del proyecto y a quien entra al equipo.
  prj_project_update: {
    subject: 'Proyecto {{proyecto}}: {{novedad}}',
    body: 'El proyecto {{proyecto}} tiene una novedad: {{novedad}}. Revíselo en ARZA ONE › Proyectos.',
    urgent: false,
  },
  // B28: a quien atiende o pidió un tiquete, y a quien decide una compensación.
  svc_ticket_update: {
    subject: 'Tiquete {{tiquete}}: {{novedad}}',
    body: 'El tiquete {{tiquete}} tiene una novedad: {{novedad}}. Revíselo en ARZA ONE › Servicio.',
    urgent: false,
  },
  // B28: plazo al 80 %, plazo vencido y tiquete crítico (PT-TEC-003). Urgente por decisión del
  // dueño del producto (06/11/2026): llega aunque sea fuera de la jornada.
  svc_ticket_alert: {
    subject: 'Atención: tiquete {{tiquete}}',
    body: 'El tiquete {{tiquete}} necesita atención: {{novedad}}. Ábralo en ARZA ONE › Servicio.',
    urgent: true,
  },
  // B29: radicada, asignada, por aprobar, devuelta, respondida, trasladada a Privacidad o a Calidad,
  // por vencer y vencida. No es urgente: los plazos son de días hábiles (decisión 11).
  svc_pqrsf_update: {
    subject: 'PQRSF {{pqrsf}}: {{novedad}}',
    body: 'La PQRSF {{pqrsf}} tiene una novedad: {{novedad}}. Revísela en ARZA ONE › Servicio › PQRSF.',
    urgent: false,
  },
  // B35: a cada responsable de una tarea de inducción de un colaborador nuevo (decisión 6).
  hr_onboarding_task: {
    subject: 'Tarea de inducción: {{tarea}}',
    body: 'Ingresa un colaborador nuevo y a usted le corresponde la tarea «{{tarea}}», con fecha {{vence}}. Cuando la termine, márquela como hecha en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  // B36: al jefe (o a Talento humano) cuando le piden algo y al colaborador cuando le responden.
  hr_leave_update: {
    subject: 'Ausencia: {{novedad}}',
    body: '{{novedad}}. Revísela en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  hr_overtime_update: {
    subject: 'Horas extras: {{novedad}}',
    body: '{{novedad}}. Revísela en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  hr_review_update: {
    subject: 'Su evaluación de desempeño está lista',
    body: '{{nombre}}, su jefe calificó su evaluación de desempeño. Revísela y acéptela en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  // Sin el contenido del caso: la persona lo consulta en la plataforma (información restringida).
  hr_disciplinary_notice: {
    subject: 'Citación de Talento humano',
    body: 'Talento humano le envió una citación para el {{fecha}}. Consúltela en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  hr_offboarding_task: {
    subject: 'Tarea de un retiro: {{tarea}}',
    body: 'Un colaborador se retira y a usted le corresponde «{{tarea}}», con último día laborado el {{fecha}}. Márquela como hecha en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  // Seguridad y salud en el trabajo (B37). Sin datos de salud: el detalle está en la plataforma.
  sst_report_received: {
    subject: 'Nuevo reporte de SST: {{reporte}}',
    body: 'Llegó un reporte de {{reporte}} en {{lugar}}. Atiéndalo en ARZA ONE › Talento y SST › SST.',
    urgent: false,
  },
  sst_arl_due: {
    subject: 'Reporte a la ARL pendiente: {{codigo}}',
    body: 'El accidente de trabajo {{codigo}} debe reportarse a la ARL a más tardar el {{fecha}}. Registre el radicado en ARZA ONE › Talento y SST › SST.',
    urgent: false,
  },
  sst_exam_due: {
    subject: 'Evaluación médica ocupacional por vencer',
    body: 'Una evaluación médica ocupacional vence el {{fecha}}. Revísela en ARZA ONE › Talento y SST › SST y prográmela con la institución prestadora.',
    urgent: false,
  },
  sst_task_assigned: {
    subject: 'Tarea de seguridad y salud: {{tarea}}',
    body: 'Le corresponde «{{tarea}}», con fecha límite el {{fecha}}. Atiéndala en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  // Sin el contenido de la queja: solo los integrantes del comité la consultan en la plataforma.
  sst_complaint_received: {
    subject: 'Queja nueva para el Comité de Convivencia',
    body: 'El Comité de Convivencia recibió la queja {{codigo}}. Consúltela en ARZA ONE › Talento y SST › Comités.',
    urgent: false,
  },
  // Calidad y mejora continua (B38).
  qms_nonconformity_reported: {
    subject: 'Nueva no conformidad: {{codigo}}',
    body: 'Se registró la no conformidad {{codigo}} ({{origen}}). Aplique la corrección inmediata en ARZA ONE › Calidad › No conformidades.',
    urgent: false,
  },
  qms_action_assigned: {
    subject: 'Acción de calidad a su cargo: {{codigo}}',
    body: 'Le corresponde la acción {{codigo}}, con fecha compromiso el {{fecha}}. Cuando la ejecute, registre la evidencia en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  qms_action_to_verify: {
    subject: 'Acción por verificar: {{codigo}}',
    body: 'La acción {{codigo}} se ejecutó y espera que alguien distinto de su responsable verifique su eficacia en ARZA ONE › Calidad › Acciones.',
    urgent: false,
  },
  qms_action_overdue: {
    subject: 'Acción de calidad vencida: {{codigo}}',
    body: 'La acción {{codigo}} venció el {{fecha}} y sigue sin ejecutarse. Revísela en ARZA ONE › Calidad › Acciones.',
    urgent: false,
  },
  qms_audit_assigned: {
    subject: 'Le corresponde la auditoría interna {{codigo}}',
    body: 'Hola, {{nombre}}. Usted es el auditor de {{codigo}}, programada para el {{fecha}}. Encuéntrela en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  qms_indicator_due: {
    subject: 'Indicador por medir: {{codigo}}',
    body: 'Hola, {{nombre}}. El indicador {{codigo}} no tiene la medición de {{periodo}}. Regístrela con su evidencia en ARZA ONE › Mi espacio.',
    urgent: false,
  },
  qms_review_to_approve: {
    subject: 'Acta de revisión por la dirección por aprobar: {{codigo}}',
    body: 'Hola, {{nombre}}. El acta {{codigo}} está lista para su aprobación en ARZA ONE › Calidad › Revisión por la dirección.',
    urgent: false,
  },
  // Privacidad (B42): sin datos del titular, solo el código y la fecha límite.
  prv_request_received: {
    subject: 'Solicitud de titular nueva: {{codigo}}',
    body: 'Hola, {{nombre}}. Llegó la solicitud {{codigo}}; la fecha límite legal es el {{fecha}}. Atiéndala en ARZA ONE › Privacidad › Solicitudes de titulares.',
    urgent: false,
  },
  prv_request_due: {
    subject: 'Solicitud de titular {{codigo}}: {{novedad}}',
    body: 'Hola, {{nombre}}. La solicitud {{codigo}} {{novedad}} (fecha límite: {{fecha}}). Revísela en ARZA ONE › Privacidad › Solicitudes de titulares.',
    urgent: true,
  },
  prv_incident_due: {
    subject: 'Incidente {{codigo}}: {{novedad}}',
    body: 'Hola, {{nombre}}. El incidente {{codigo}} {{novedad}} (fecha límite para reportar a la SIC: {{fecha}}). Revíselo en ARZA ONE › Privacidad › Incidentes.',
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
