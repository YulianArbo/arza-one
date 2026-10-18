import type { StateInput, TransitionInput } from '@arza/contracts';

// Flujos de la gestión documental (B19, ADR-011): datos que el motor publica en cada empresa la
// primera vez. Administración › Flujos los puede ajustar sin programar (por ejemplo, quién aprueba),
// siempre que conserve las claves de los estados y de las acciones, que el módulo sigue.

export const CHANGE_REQUEST_FLOW = 'doc.change_request';
export const VERSION_FLOW = 'doc.version';

/** Estados del trámite de una solicitud y de una versión que el módulo reconoce. */
export const CHANGE_REQUEST_STATES = {
  filed: 'filed',
  analysis: 'in_analysis',
  approved: 'approved',
  rejected: 'rejected',
} as const;

export const VERSION_STATES = {
  drafting: 'drafting',
  review: 'review',
  approval: 'approval',
  publication: 'publication',
  published: 'published',
} as const;

function state(key: string, label: string, kind: StateInput['kind'], extra: Partial<StateInput>) {
  const base = { key, label, kind, sla_hours: null, priority: 'normal' } as const;
  return { ...base, assignee: null, approval: null, ...extra } satisfies StateInput;
}

function step(
  from: string,
  to: string,
  action: string,
  label: string,
  extra: Partial<TransitionInput>,
): TransitionInput {
  const base = { required_permission: null, condition: null, requires_comment: false } as const;
  return { from_state: from, to_state: to, action, label, ...base, ...extra };
}

const quality = { type: 'role', role: 'CALIDAD' } as const;
const direction = { type: 'role', role: 'DIRECCION' } as const;

/** Solicitud de Acción Documental: Calidad la analiza y la decide; quien la pide no la decide. */
export const CHANGE_REQUEST_FLOW_DATA = {
  key: CHANGE_REQUEST_FLOW,
  name: 'Solicitud de Acción Documental',
  description: 'FT-SGC-001: Calidad analiza la solicitud y la aprueba o la rechaza.',
  entityType: CHANGE_REQUEST_FLOW,
  states: [
    state('filed', 'Radicada', 'initial', { sla_hours: 16, assignee: quality }),
    state('in_analysis', 'En análisis', 'approval', {
      sla_hours: 24,
      approval: { mode: 'serial', approvers: [quality] },
    }),
    state('approved', 'Aprobada', 'final', {}),
    state('rejected', 'Rechazada', 'final', {}),
  ],
  transitions: [
    step('filed', 'in_analysis', 'analyze', 'Empezar el análisis', {
      required_permission: 'doc.change_request.decide',
    }),
    step('in_analysis', 'approved', 'approve', 'Aprobar', {
      required_permission: 'doc.change_request.decide',
    }),
    step('in_analysis', 'rejected', 'reject', 'Rechazar', {
      required_permission: 'doc.change_request.decide',
      requires_comment: true,
    }),
  ],
};

/** Versión: quien elabora la envía, Calidad la revisa, Dirección la aprueba y Calidad la publica. */
export const VERSION_FLOW_DATA = {
  key: VERSION_FLOW,
  name: 'Revisión de versión',
  description:
    'Quien elabora envía la versión; Calidad la revisa, Dirección la aprueba y Calidad la publica.',
  entityType: VERSION_FLOW,
  states: [
    state('drafting', 'Elaboración', 'initial', { assignee: { type: 'initiator' } }),
    state('review', 'Revisión de Calidad', 'approval', {
      sla_hours: 16,
      approval: { mode: 'serial', approvers: [quality] },
    }),
    state('approval', 'Aprobación de Dirección', 'approval', {
      sla_hours: 16,
      priority: 'high',
      approval: { mode: 'serial', approvers: [direction] },
    }),
    state('publication', 'Publicación', 'normal', { sla_hours: 8, assignee: quality }),
    state('published', 'Publicada', 'final', {}),
  ],
  transitions: [
    step('drafting', 'review', 'submit', 'Enviar a revisión', {
      required_permission: 'doc.version.submit',
    }),
    step('review', 'approval', 'approve', 'Aprobar la revisión', {
      required_permission: 'doc.version.review',
    }),
    step('review', 'drafting', 'reject', 'Devolver para corregir', {
      required_permission: 'doc.version.review',
      requires_comment: true,
    }),
    step('approval', 'publication', 'approve', 'Aprobar', {
      required_permission: 'doc.version.approve',
    }),
    step('approval', 'drafting', 'reject', 'Devolver para corregir', {
      required_permission: 'doc.version.approve',
      requires_comment: true,
    }),
    step('publication', 'published', 'publish', 'Publicar', {
      required_permission: 'doc.version.publish',
    }),
  ],
};
