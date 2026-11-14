import { z } from 'zod';

// Piezas comunes de la mesa de ayuda (M08, B28; ficha 17.9): códigos de error, estados, prioridades,
// niveles, categorías, canales y las reglas del reloj del acuerdo de servicio.

/** Códigos estables de los errores de la mesa de ayuda (numeral 14.2). */
export const SERVICE_ERROR_CODES = {
  notFound: 'SERVICE_NOT_FOUND',
  statusInvalid: 'SERVICE_STATUS_INVALID',
  assigneeInvalid: 'SERVICE_ASSIGNEE_INVALID',
  linkInvalid: 'SERVICE_LINK_INVALID',
  levelInvalid: 'SERVICE_LEVEL_INVALID',
  compensationInvalid: 'SERVICE_COMPENSATION_INVALID',
  datesInvalid: 'SERVICE_DATES_INVALID',
} as const;

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

/** Ficha 17.9: nuevo → asignado → en curso → en espera del cliente → resuelto → cerrado. */
export const TICKET_STATUSES = {
  new: 'Nuevo',
  assigned: 'Asignado',
  in_progress: 'En curso',
  waiting_customer: 'En espera del cliente',
  resolved: 'Resuelto',
  closed: 'Cerrado',
} as const;

export type TicketStatus = keyof typeof TICKET_STATUSES;

export const ticketStatusSchema = enumOf(TICKET_STATUSES).describe('Estado del tiquete');

/** Estados en que corre el reloj del acuerdo de servicio. */
export const CLOCK_RUNNING_STATUSES: readonly TicketStatus[] = ['new', 'assigned', 'in_progress'];

/** Estados abiertos: el tiquete todavía se atiende (el reloj puede estar pausado). */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = [
  ...CLOCK_RUNNING_STATUSES,
  'waiting_customer',
];

export const TICKET_PRIORITIES = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
} as const;

export type TicketPriority = keyof typeof TICKET_PRIORITIES;

export const ticketPrioritySchema = enumOf(TICKET_PRIORITIES).describe('Prioridad');

/** Niveles de atención (decisión 3): N1 Servicio, N2 técnico, N3 especialista o proveedor. */
export const TICKET_LEVELS = {
  1: 'N1 · Servicio al cliente',
  2: 'N2 · Líder técnico o equipo del proyecto',
  3: 'N3 · Especialista o proveedor externo',
} as const;

export const MAX_TICKET_LEVEL = 3;

export const ticketLevelSchema = z.number().int().min(1).max(MAX_TICKET_LEVEL).describe('Nivel');

export const TICKET_CATEGORIES = {
  support: 'Soporte de aplicación',
  incident: 'Falla o incidente',
  change: 'Solicitud de cambio',
  question: 'Consulta',
  platform: 'ARZA ONE (esta plataforma)',
  other: 'Otro',
} as const;

export type TicketCategory = keyof typeof TICKET_CATEGORIES;

export const ticketCategorySchema = enumOf(TICKET_CATEGORIES).describe('Categoría');

/** Por dónde llegó. El portal del cliente (B30) es el único que lo registra «portal». */
export const TICKET_CHANNELS = {
  internal: 'Registro interno',
  email: 'Correo',
  phone: 'Teléfono',
  portal: 'Portal del cliente',
} as const;

export type TicketChannel = keyof typeof TICKET_CHANNELS;

export const ticketChannelSchema = enumOf(TICKET_CHANNELS).describe('Canal');

/** Cómo cuenta el reloj: horas hábiles del horario laboral, o corrido las 24 horas. */
export const SLA_CALENDARS = {
  business: 'Horas hábiles',
  continuous: 'Corrido, 24 horas al día',
} as const;

export type SlaCalendar = keyof typeof SLA_CALENDARS;

export const slaCalendarSchema = enumOf(SLA_CALENDARS).describe('Cómo cuenta el reloj');

/** Reglas del reloj (ficha 17.9 y decisiones 2 y 7 del B28). */
export const SLA_RULES = {
  /** Alerta al responsable y al líder cuando se consume este porcentaje del plazo de solución. */
  warnPct: 80,
  /** Un tiquete resuelto se cierra solo pasados estos días hábiles si nadie lo reabre. */
  autoCloseBusinessDays: 5,
  /** Ningún plazo pasa de 2000 horas. */
  maxHours: 2000,
} as const;

/** Duración de la garantía de un entregable aceptado (decisión 10), en días calendario. */
export const WARRANTY_DEFAULT_DAYS = 90;

export const COMPENSATION_TYPES = {
  discount: 'Descuento en factura',
  support_hours: 'Horas de soporte sin costo',
  service_extension: 'Extensión del servicio',
} as const;

export type CompensationType = keyof typeof COMPENSATION_TYPES;

export const compensationTypeSchema = enumOf(COMPENSATION_TYPES).describe('Tipo de compensación');

export const COMPENSATION_STATUSES = {
  proposed: 'Por aprobar',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  applied: 'Aplicada',
} as const;

export type CompensationStatus = keyof typeof COMPENSATION_STATUSES;

export const compensationStatusSchema = enumOf(COMPENSATION_STATUSES);

/** Qué acción puede seguir a cada estado del tiquete (la API y la ficha usan la misma tabla). */
export const TICKET_ACTIONS = {
  assign: ['new', 'assigned', 'in_progress', 'waiting_customer'],
  escalate: ['new', 'assigned', 'in_progress', 'waiting_customer'],
  start: ['assigned'],
  wait: ['in_progress'],
  resume: ['waiting_customer'],
  resolve: ['in_progress', 'waiting_customer'],
  reopen: ['resolved'],
  close: ['resolved'],
} as const satisfies Record<string, readonly TicketStatus[]>;

export type TicketAction = keyof typeof TICKET_ACTIONS;

export function canTicketStep(action: TicketAction, status: TicketStatus): boolean {
  const allowed: readonly TicketStatus[] = TICKET_ACTIONS[action];
  return allowed.includes(status);
}
