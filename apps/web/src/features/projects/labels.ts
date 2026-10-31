import {
  AUTHORIZATION_STATUSES,
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

// Textos y rutas de Proyectos (B26). Las etiquetas vienen de los contratos; aquí solo los tonos y
// las rutas.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const BASE = '/app/proyectos';

export const PROJECT_PATHS = {
  list: BASE,
  create: `${BASE}/nuevo`,
  fromContract: (contractId: string) => `${BASE}/nuevo?contrato=${contractId}`,
  project: (id: string) => `${BASE}/${id}`,
  edit: (id: string) => `${BASE}/${id}/editar`,
} as const;

export {
  AUTHORIZATION_STATUSES,
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
