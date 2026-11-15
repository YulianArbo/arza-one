import { z } from 'zod';

// Piezas comunes de Proyectos (M07, B26; ficha 17.8): códigos de error, estados, tipos y roles.

/** Códigos estables de los errores de Proyectos (numeral 14.2). */
export const PROJECT_ERROR_CODES = {
  notFound: 'PROJECT_NOT_FOUND',
  statusInvalid: 'PROJECT_STATUS_INVALID',
  contractInvalid: 'PROJECT_CONTRACT_INVALID',
  partyInvalid: 'PROJECT_PARTY_INVALID',
  datesInvalid: 'PROJECT_DATES_INVALID',
  memberInvalid: 'PROJECT_MEMBER_INVALID',
  memberDuplicate: 'PROJECT_MEMBER_DUPLICATE',
  billingExceeded: 'PROJECT_BILLING_EXCEEDED',
  sprintActive: 'PROJECT_SPRINT_ACTIVE',
  criteriaRequired: 'PROJECT_ITEM_CRITERIA_REQUIRED',
  evidenceRequired: 'PROJECT_ITEM_EVIDENCE_REQUIRED',
  moveInvalid: 'PROJECT_ITEM_MOVE_INVALID',
  parentInvalid: 'PROJECT_ITEM_PARENT_INVALID',
  authorizationRequired: 'PROJECT_AUTHORIZATION_REQUIRED',
  // B27
  timeInvalid: 'PROJECT_TIME_INVALID',
  reviewInvalid: 'PROJECT_REVIEW_INVALID',
  signerInvalid: 'PROJECT_ACCEPTANCE_SIGNER_INVALID',
  formUnavailable: 'PROJECT_FORM_UNAVAILABLE',
  fileInvalid: 'PROJECT_FILE_INVALID',
  closingBlocked: 'PROJECT_CLOSING_BLOCKED',
} as const;

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

/** Ficha 17.8: planeación → en ejecución → en riesgo o pausado → en cierre → cerrado. */
export const PROJECT_STATUSES = {
  planning: 'En planeación',
  in_progress: 'En ejecución',
  at_risk: 'En riesgo',
  paused: 'Pausado',
  closing: 'En cierre',
  closed: 'Cerrado',
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUSES;

export const projectStatusSchema = enumOf(PROJECT_STATUSES).describe('Estado del proyecto');

/** Estados en que el equipo trabaja: el tablero se mueve y las iteraciones corren. */
export const WORKING_STATUSES: readonly ProjectStatus[] = ['in_progress', 'at_risk'];

export const PROJECT_TYPES = {
  development: 'Desarrollo a la medida',
  support: 'Soporte y mantenimiento',
  integration: 'Integración',
  other: 'Otro',
} as const;

export type ProjectType = keyof typeof PROJECT_TYPES;

export const projectTypeSchema = enumOf(PROJECT_TYPES).describe('Tipo de proyecto');

export const PROJECT_METHODOLOGIES = {
  scrum: 'Por iteraciones (Scrum)',
  kanban: 'Flujo continuo (Kanban)',
  phases: 'Por fases',
} as const;

export type ProjectMethodology = keyof typeof PROJECT_METHODOLOGIES;

export const projectMethodologySchema = enumOf(PROJECT_METHODOLOGIES).describe('Metodología');

/** Autorización de la Dirección para iniciar sin contrato vigente (ficha 17.8). */
export const AUTHORIZATION_STATUSES = {
  none: 'Sin pedir',
  requested: 'Pedida a la Dirección',
  granted: 'Autorizado',
  denied: 'No autorizado',
} as const;

export type AuthorizationStatus = keyof typeof AUTHORIZATION_STATUSES;

export const authorizationStatusSchema = enumOf(AUTHORIZATION_STATUSES);

export const MEMBER_ROLES = {
  leader: 'Líder del proyecto',
  analysis: 'Análisis',
  development: 'Desarrollo',
  design: 'Diseño',
  testing: 'Pruebas',
} as const;

export type MemberRole = keyof typeof MEMBER_ROLES;

export const memberRoleSchema = enumOf(MEMBER_ROLES).describe('Rol en el proyecto');

/**
 * Un hito se cumple a mano o, si tiene entregables, queda «Listo para facturar» cuando el cliente
 * los acepta todos (B27).
 */
export const MILESTONE_STATUSES = {
  pending: 'Pendiente',
  done: 'Cumplido',
  billable: 'Listo para facturar',
} as const;

export type MilestoneStatus = keyof typeof MILESTONE_STATUSES;

export const milestoneStatusSchema = enumOf(MILESTONE_STATUSES);

export const SPRINT_STATUSES = {
  planned: 'Planeada',
  active: 'En curso',
  closed: 'Cerrada',
} as const;

export type SprintStatus = keyof typeof SPRINT_STATUSES;

export const sprintStatusSchema = enumOf(SPRINT_STATUSES);

export const ITEM_TYPES = {
  epic: 'Épica',
  story: 'Historia',
  task: 'Tarea',
  defect: 'Defecto',
} as const;

export type ItemType = keyof typeof ITEM_TYPES;

export const itemTypeSchema = enumOf(ITEM_TYPES).describe('Tipo de ítem');

/** Columnas del tablero, en su orden (ficha 17.8). */
export const ITEM_STATUSES = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  in_review: 'En revisión',
  in_testing: 'En pruebas',
  done: 'Terminado',
} as const;

export type ItemStatus = keyof typeof ITEM_STATUSES;

export const itemStatusSchema = enumOf(ITEM_STATUSES).describe('Estado del ítem');

export const ITEM_STATUS_ORDER = Object.keys(ITEM_STATUSES) as ItemStatus[];

export const ITEM_PRIORITIES = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
} as const;

export type ItemPriority = keyof typeof ITEM_PRIORITIES;

export const itemPrioritySchema = enumOf(ITEM_PRIORITIES).describe('Prioridad');

export const LINK_KINDS = {
  repository: 'Repositorio de código',
  test_environment: 'Entorno de pruebas',
  production: 'Producción',
  design: 'Diseño',
  documentation: 'Documentación',
  other: 'Otro',
} as const;

export type LinkKind = keyof typeof LINK_KINDS;

export const linkKindSchema = enumOf(LINK_KINDS).describe('Qué es el enlace');

/** El número no tiene más decimales que los indicados (sin tropezar con el redondeo binario). */
export function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Cada cuánto el tablero vuelve a preguntar por los cambios de los demás. */
export const BOARD_REFRESH_SECONDS = 10;

/**
 * Un ítem puede avanzar una sola columna o volver a cualquiera anterior: no se salta la revisión
 * ni las pruebas (ficha 17.8). Lo usan la API y el tablero para no ofrecer un paso imposible.
 */
export function canMoveItem(from: ItemStatus, to: ItemStatus): boolean {
  const gap = ITEM_STATUS_ORDER.indexOf(to) - ITEM_STATUS_ORDER.indexOf(from);
  return gap !== 0 && gap <= 1;
}

/** Las historias, tareas y defectos van a iteraciones y al tablero; las épicas, no. */
export function isWorkItem(type: ItemType): boolean {
  return type !== 'epic';
}

/** Qué ítem puede colgar de cuál: la épica agrupa historias; la historia, tareas y defectos. */
const PARENT_TYPES: Readonly<Record<ItemType, readonly ItemType[]>> = {
  epic: [],
  story: ['epic'],
  task: ['epic', 'story'],
  defect: ['epic', 'story'],
};

export function parentAllowedTypes(type: ItemType): readonly ItemType[] {
  return PARENT_TYPES[type];
}

// B27: horas, entregables y actas, riesgos, liberaciones, revisiones de código e incidentes.

/** Ficha 17.8: horas con máximo siete días de atraso; en cuartos de hora (decisión 8). */
export const TIME_RULES = { maxLateDays: 7, step: 0.25, maxPerDay: 24 } as const;

export const TIME_ENTRY_STATUSES = {
  registered: 'Por aprobar',
  approved: 'Aprobada',
  returned: 'Devuelta',
} as const;

export type TimeEntryStatus = keyof typeof TIME_ENTRY_STATUSES;

export const timeEntryStatusSchema = enumOf(TIME_ENTRY_STATUSES).describe('Estado de la hora');

/** Ficha 17.8: en preparación → entregado → aceptado o devuelto. */
export const DELIVERABLE_STATUSES = {
  preparing: 'En preparación',
  delivered: 'Entregado',
  accepted: 'Aceptado',
  returned: 'Devuelto',
} as const;

export type DeliverableStatus = keyof typeof DELIVERABLE_STATUSES;

export const deliverableStatusSchema =
  enumOf(DELIVERABLE_STATUSES).describe('Estado del entregable');

/** El acta FT-TEC-001 de una entrega, desde que se genera hasta que el cliente responde. */
export const ACCEPTANCE_STATUSES = {
  preparing: 'Generando el acta',
  in_signature: 'En firma del cliente',
  accepted: 'Aceptada y firmada',
  tacit: 'Aceptada tácitamente',
  returned: 'Devuelta por el cliente',
  unanswered: 'Sin respuesta en el plazo',
  cancelled: 'Anulada',
} as const;

export type AcceptanceStatus = keyof typeof ACCEPTANCE_STATUSES;

export const acceptanceStatusSchema = enumOf(ACCEPTANCE_STATUSES).describe('Estado del acta');

/** Plazo del cliente para responder (decisión 4): por defecto 10 días calendario. */
export const ACCEPTANCE_RULES = { defaultDays: 10, minDays: 1, maxDays: 30 } as const;

export const DELIVERY_ENVIRONMENTS = { test: 'Pruebas', production: 'Producción' } as const;

export type DeliveryEnvironment = keyof typeof DELIVERY_ENVIRONMENTS;

export const deliveryEnvironmentSchema = enumOf(DELIVERY_ENVIRONMENTS).describe('Ambiente');

export const RISK_STATUSES = {
  open: 'Abierto',
  mitigating: 'En tratamiento',
  closed: 'Cerrado',
} as const;

export type RiskStatus = keyof typeof RISK_STATUSES;

export const riskStatusSchema = enumOf(RISK_STATUSES).describe('Estado del riesgo');

export const PROJECT_RISK_LEVELS = { low: 'Bajo', medium: 'Medio', high: 'Alto' } as const;

export type ProjectRiskLevel = keyof typeof PROJECT_RISK_LEVELS;

export const projectRiskLevelSchema = enumOf(PROJECT_RISK_LEVELS);

/** Nivel del riesgo: probabilidad por impacto, de 1 a 25 (decisión 10). */
export function riskLevelOf(probability: number, impact: number): ProjectRiskLevel {
  const score = probability * impact;
  if (score >= 15) return 'high';
  return score >= 7 ? 'medium' : 'low';
}

export const REVIEW_RESULTS = {
  approved: 'Aprobada',
  changes_requested: 'Requiere cambios',
} as const;

export type ReviewResult = keyof typeof REVIEW_RESULTS;

export const reviewResultSchema = enumOf(REVIEW_RESULTS).describe('Resultado de la revisión');

export const CHECK_ANSWERS = { yes: 'Cumple', no: 'No cumple', na: 'No aplica' } as const;

export type CheckAnswer = keyof typeof CHECK_ANSWERS;

export const checkAnswerSchema = enumOf(CHECK_ANSWERS);

/**
 * Puntos de la Lista de Revisión de Código FT-TEC-002, según MN-TEC-001 y el numeral 11. Calidad
 * puede ajustar el formato en el diseñador; estos son los que se verifican en cada revisión.
 */
export const CODE_REVIEW_CHECKLIST = [
  'Sigue los estándares de MN-TEC-001: nombres claros, funciones cortas y sin código muerto',
  'Pasa el análisis estático y el formato sin desactivar reglas',
  'Tiene pruebas automáticas del cambio y todas pasan',
  'Valida las entradas y no expone secretos ni datos personales',
  'Maneja los errores con mensajes claros',
  'No agrega dependencias sin licencia permisiva y mantenimiento activo',
  'La documentación y los cambios de base de datos están al día',
  'Cumple los criterios de aceptación del ítem',
] as const;

export const INCIDENT_KINDS = { failure: 'Falla del servicio', security: 'Seguridad' } as const;

export type IncidentKind = keyof typeof INCIDENT_KINDS;

export const incidentKindSchema = enumOf(INCIDENT_KINDS).describe('Tipo de incidente');

export const INCIDENT_SEVERITIES = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
} as const;

export type IncidentSeverity = keyof typeof INCIDENT_SEVERITIES;

export const incidentSeveritySchema = enumOf(INCIDENT_SEVERITIES).describe('Gravedad');

export const INCIDENT_STATUSES = { open: 'Abierto', resolved: 'Resuelto' } as const;

export type IncidentStatus = keyof typeof INCIDENT_STATUSES;

export const incidentStatusSchema = enumOf(INCIDENT_STATUSES);
