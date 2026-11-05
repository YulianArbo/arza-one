import type { StateInput, TransitionInput } from '@arza/contracts';

// Flujo del prospecto en el motor (B22, ficha 17.6): al registrarlo, el rol Comercial recibe en
// Mis tareas la tarea «Contactar al prospecto». Se cierra al calificarlo o al descartarlo, desde el
// CRM o desde la misma tarea. Administración › Flujos lo puede ajustar sin programar, siempre que
// conserve las claves de los estados y de las acciones, que el módulo sigue.

export const LEAD_FLOW = 'crm.lead';

export const LEAD_FLOW_STATES = {
  contact: 'contact',
  qualified: 'qualified',
  discarded: 'discarded',
} as const;

export const LEAD_FLOW_ACTIONS = { qualify: 'qualify', discard: 'discard' } as const;

/** Un día hábil para el primer contacto. */
const CONTACT_SLA_HOURS = 8;

function state(key: string, label: string, kind: StateInput['kind'], extra: Partial<StateInput>) {
  const base = { key, label, kind, sla_hours: null, priority: 'normal' } as const;
  return { ...base, assignee: null, approval: null, ...extra } satisfies StateInput;
}

function step(from: string, to: string, action: string, label: string, comment: boolean) {
  return {
    from_state: from,
    to_state: to,
    action,
    label,
    required_permission: 'crm.lead.update',
    condition: null,
    requires_comment: comment,
  } satisfies TransitionInput;
}

export const LEAD_FLOW_DATA = {
  key: LEAD_FLOW,
  name: 'Contacto de prospectos',
  description: 'PR-COM-001: Comercial contacta al prospecto nuevo y lo califica o lo descarta.',
  entityType: LEAD_FLOW,
  states: [
    state('contact', 'Contactar al prospecto', 'initial', {
      sla_hours: CONTACT_SLA_HOURS,
      assignee: { type: 'role', role: 'COMERCIAL' },
    }),
    state('qualified', 'Calificado', 'final', {}),
    state('discarded', 'Descartado', 'final', {}),
  ],
  transitions: [
    step('contact', 'qualified', 'qualify', 'Calificar', false),
    step('contact', 'discarded', 'discard', 'Descartar', true),
  ],
};

// Aprobación de una cotización (B23, ficha 17.6): si algún descuento pasa el tope, la Dirección
// recibe en Mis tareas «Aprobar la cotización …» y la aprueba o la devuelve con un comentario. Quien
// la elaboró no la decide. Se puede atender desde la ficha de la cotización o desde la tarea.

export const QUOTE_FLOW = 'crm.quote';

export const QUOTE_FLOW_STATES = {
  approval: 'approval',
  approved: 'approved',
  returned: 'returned',
} as const;

export const QUOTE_FLOW_ACTIONS = { approve: 'approve', return: 'return' } as const;

/** Dos días hábiles para decidir. */
const APPROVAL_SLA_HOURS = 16;

function decision(to: string, action: string, label: string, comment: boolean) {
  return {
    from_state: 'approval',
    to_state: to,
    action,
    label,
    required_permission: 'crm.quote.approve',
    condition: null,
    requires_comment: comment,
  } satisfies TransitionInput;
}

export const QUOTE_FLOW_DATA = {
  key: QUOTE_FLOW,
  name: 'Aprobación de cotizaciones',
  description:
    'PR-COM-001: la Dirección aprueba o devuelve la cotización cuyo descuento pasa el tope.',
  entityType: QUOTE_FLOW,
  states: [
    state('approval', 'Aprobar la cotización', 'initial', {
      sla_hours: APPROVAL_SLA_HOURS,
      priority: 'high',
      assignee: { type: 'role', role: 'DIRECCION' },
    }),
    state('approved', 'Aprobada', 'final', {}),
    state('returned', 'Devuelta para corregir', 'final', {}),
  ],
  transitions: [
    decision('approved', 'approve', 'Aprobar', false),
    decision('returned', 'return', 'Devolver para corregir', true),
  ],
};
