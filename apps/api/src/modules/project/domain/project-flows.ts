import type { StateInput, TransitionInput } from '@arza/contracts';

// Flujo de Proyectos en el motor (B26, ficha 17.8): «No se inicia un proyecto sin contrato vigente o
// autorización expresa de la Dirección». Sin contrato vigente, el Líder técnico pide la autorización
// con su motivo y la Dirección recibe en Mis tareas «Autorizar el inicio del proyecto …»: si
// autoriza, el proyecto pasa a ejecución; si no, sigue en planeación con el comentario.
// Administración › Flujos lo puede ajustar sin programar si conserva las claves.

export const START_FLOW = 'prj.start';

export const START_STATES = {
  decision: 'decision',
  authorized: 'authorized',
  denied: 'denied',
} as const;

export const START_ACTIONS = { authorize: 'authorize', deny: 'deny' } as const;

/** Dos días hábiles para decidir. */
const DECISION_SLA_HOURS = 16;

function state(key: string, label: string, kind: StateInput['kind'], extra: Partial<StateInput>) {
  const base = { key, label, kind, sla_hours: null, priority: 'normal' } as const;
  return { ...base, assignee: null, approval: null, ...extra } satisfies StateInput;
}

function step(to: string, action: string, label: string, comment: boolean) {
  return {
    from_state: START_STATES.decision,
    to_state: to,
    action,
    label,
    // La Dirección autoriza: es quien aprueba los contratos, y este inicio va sin uno vigente.
    required_permission: 'contract.approve',
    condition: null,
    requires_comment: comment,
  } satisfies TransitionInput;
}

export const START_FLOW_DATA = {
  key: START_FLOW,
  name: 'Autorización para iniciar un proyecto',
  description:
    'Ficha 17.8: sin contrato vigente, la Dirección autoriza o no el inicio del proyecto.',
  entityType: START_FLOW,
  states: [
    state(START_STATES.decision, 'Autorizar el inicio del proyecto', 'initial', {
      sla_hours: DECISION_SLA_HOURS,
      priority: 'high',
      assignee: { type: 'role', role: 'DIRECCION' },
    }),
    state(START_STATES.authorized, 'Autorizado', 'final', {}),
    state(START_STATES.denied, 'No autorizado', 'final', {}),
  ],
  transitions: [
    step(START_STATES.authorized, START_ACTIONS.authorize, 'Autorizar el inicio', false),
    step(START_STATES.denied, START_ACTIONS.deny, 'No autorizar', true),
  ],
};
