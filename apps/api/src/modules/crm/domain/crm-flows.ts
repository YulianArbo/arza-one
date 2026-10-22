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
