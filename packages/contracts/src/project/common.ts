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
} as const;

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

/** Ficha 17.8. El cierre («en cierre», «cerrado») llega con las actas del B27. */
export const PROJECT_STATUSES = {
  planning: 'En planeación',
  in_progress: 'En ejecución',
  at_risk: 'En riesgo',
  paused: 'Pausado',
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

export const MILESTONE_STATUSES = { pending: 'Pendiente', done: 'Cumplido' } as const;

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
