import {
  ACCEPTANCE_STATUSES,
  AUTHORIZATION_STATUSES,
  CHECK_ANSWERS,
  DELIVERABLE_STATUSES,
  DELIVERY_ENVIRONMENTS,
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  PROJECT_RISK_LEVELS,
  REVIEW_RESULTS,
  RISK_STATUSES,
  TIME_ENTRY_STATUSES,
  type AcceptanceStatus,
  type DeliverableStatus,
  type IncidentSeverity,
  type ProjectRiskLevel,
  type ReviewResult,
  type TimeEntryStatus,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  ITEM_TYPES,
  LINK_KINDS,
  MEMBER_ROLES,
  MILESTONE_STATUSES,
  PROJECT_METHODOLOGIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SPRINT_STATUSES,
  type ItemPriority,
  type ItemStatus,
  type ItemType,
  type ProjectStatus,
  type SprintStatus,
} from '@arza/contracts';

// Textos y rutas de Proyectos (B26 y B27). Las etiquetas vienen de los contratos; aquí solo los
// tonos y las rutas.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const BASE = '/app/proyectos';

export const PROJECT_PATHS = {
  list: BASE,
  create: `${BASE}/nuevo`,
  fromContract: (contractId: string) => `${BASE}/nuevo?contrato=${contractId}`,
  project: (id: string) => `${BASE}/${id}`,
  edit: (id: string) => `${BASE}/${id}/editar`,
  myHours: `${BASE}/horas`,
} as const;

export {
  ACCEPTANCE_STATUSES,
  AUTHORIZATION_STATUSES,
  CHECK_ANSWERS,
  DELIVERABLE_STATUSES,
  DELIVERY_ENVIRONMENTS,
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  PROJECT_RISK_LEVELS,
  REVIEW_RESULTS,
  RISK_STATUSES,
  TIME_ENTRY_STATUSES,
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  ITEM_TYPES,
  LINK_KINDS,
  MEMBER_ROLES,
  MILESTONE_STATUSES,
  PROJECT_METHODOLOGIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SPRINT_STATUSES,
};

export const PROJECT_STATUS_TONES: Readonly<Record<ProjectStatus, Tone>> = {
  planning: 'neutral',
  in_progress: 'success',
  at_risk: 'warning',
  paused: 'neutral',
  closing: 'info',
  closed: 'neutral',
};

export const TIME_TONES: Readonly<Record<TimeEntryStatus, Tone>> = {
  registered: 'info',
  approved: 'success',
  returned: 'warning',
};

export const DELIVERABLE_TONES: Readonly<Record<DeliverableStatus, Tone>> = {
  preparing: 'neutral',
  delivered: 'info',
  accepted: 'success',
  returned: 'warning',
};

export const ACCEPTANCE_TONES: Readonly<Record<AcceptanceStatus, Tone>> = {
  preparing: 'neutral',
  in_signature: 'info',
  accepted: 'success',
  tacit: 'success',
  returned: 'warning',
  unanswered: 'warning',
  cancelled: 'destructive',
};

export const RISK_LEVEL_TONES: Readonly<Record<ProjectRiskLevel, Tone>> = {
  low: 'neutral',
  medium: 'warning',
  high: 'destructive',
};

export const SEVERITY_TONES: Readonly<Record<IncidentSeverity, Tone>> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'neutral',
};

export const REVIEW_TONES: Readonly<Record<ReviewResult, Tone>> = {
  approved: 'success',
  changes_requested: 'warning',
};

export const SPRINT_TONES: Readonly<Record<SprintStatus, Tone>> = {
  planned: 'neutral',
  active: 'info',
  closed: 'success',
};

export const ITEM_TYPE_TONES: Readonly<Record<ItemType, Tone>> = {
  epic: 'info',
  story: 'neutral',
  task: 'neutral',
  defect: 'destructive',
};

export const PRIORITY_TONES: Readonly<Record<ItemPriority, Tone>> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'destructive',
};

export const ITEM_STATUS_TONES: Readonly<Record<ItemStatus, Tone>> = {
  pending: 'neutral',
  in_progress: 'info',
  in_review: 'info',
  in_testing: 'warning',
  done: 'success',
};

/** «#12 Consultar facturas». */
export function itemLabel(item: { readonly number: number; readonly title: string }): string {
  return `#${String(item.number)} ${item.title}`;
}
