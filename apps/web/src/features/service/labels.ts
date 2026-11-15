import { TICKET_LEVELS as LEVELS } from '@arza/contracts';
import type {
  ClockState,
  CompensationStatus,
  KbStatus,
  PqrsfDueState,
  PqrsfStatus,
  TicketPriority,
  TicketStatus,
} from '@arza/contracts';

// Textos y rutas de Servicio al cliente (B28 y B29). Las etiquetas vienen de los contratos; aquí
// solo los tonos y las rutas.

export {
  CLOCK_STATES,
  COMPENSATION_STATUSES,
  COMPENSATION_TYPES,
  SLA_CALENDARS,
  TICKET_CATEGORIES,
  TICKET_CHANNELS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_VIEWS,
  KB_AUDIENCES,
  KB_CATEGORIES,
  KB_STATUSES,
  PQRSF_APPROVALS,
  PQRSF_CHANNELS,
  PQRSF_DUE_STATES,
  PQRSF_STATUSES,
  PQRSF_TYPES,
  PQRSF_VIEWS,
  PRIVACY_KINDS,
  TICKET_SURVEY_STATES,
} from '@arza/contracts';

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const BASE = '/app/servicio';

export const SERVICE_PATHS = {
  inbox: BASE,
  create: `${BASE}/tiquetes/nuevo`,
  ticket: (id: string) => `${BASE}/tiquetes/${id}`,
  warranties: `${BASE}/garantias`,
  policies: `${BASE}/acuerdos`,
  tickets: `${BASE}/tiquetes`,
  pqrsfInbox: `${BASE}/pqrsf`,
  pqrsfCreate: `${BASE}/pqrsf/nueva`,
  pqrsf: (id: string) => `${BASE}/pqrsf/${id}`,
  surveys: `${BASE}/encuestas`,
  knowledge: `${BASE}/conocimiento`,
  articleCreate: `${BASE}/conocimiento/nuevo`,
  article: (id: string) => `${BASE}/conocimiento/${id}`,
  articleEdit: (id: string) => `${BASE}/conocimiento/${id}/editar`,
} as const;

export const PQRSF_STATUS_TONES: Readonly<Record<PqrsfStatus, Tone>> = {
  filed: 'info',
  classified: 'info',
  in_progress: 'neutral',
  responded: 'success',
  closed: 'neutral',
};

export const PQRSF_DUE_TONES: Readonly<Record<PqrsfDueState, Tone>> = {
  on_time: 'success',
  at_risk: 'warning',
  overdue: 'destructive',
  stopped: 'neutral',
};

export const KB_STATUS_TONES: Readonly<Record<KbStatus, Tone>> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

export const TICKET_STATUS_TONES: Readonly<Record<TicketStatus, Tone>> = {
  new: 'info',
  assigned: 'info',
  in_progress: 'neutral',
  waiting_customer: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

export const PRIORITY_TONES: Readonly<Record<TicketPriority, Tone>> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'neutral',
  low: 'neutral',
};

export const CLOCK_TONES: Readonly<Record<ClockState, Tone>> = {
  on_time: 'success',
  at_risk: 'warning',
  overdue: 'destructive',
  paused: 'info',
  stopped: 'neutral',
};

export const COMPENSATION_TONES: Readonly<Record<CompensationStatus, Tone>> = {
  proposed: 'warning',
  approved: 'success',
  rejected: 'destructive',
  applied: 'neutral',
};

/** «N2 · Líder técnico o equipo del proyecto». */
export function levelLabel(level: number): string {
  const found = Object.entries(LEVELS).find(([key]) => Number(key) === level);
  return found?.[1] ?? `Nivel ${String(level)}`;
}
