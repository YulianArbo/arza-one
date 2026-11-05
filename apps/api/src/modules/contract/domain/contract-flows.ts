import type { StateInput, TransitionInput } from '@arza/contracts';

// Flujos de Contratos en el motor (B24, ficha 17.7). Administración › Flujos los puede ajustar sin
// programar, siempre que conserve las claves de los estados y de las acciones, que el módulo sigue.
// - Aprobación del contrato: la Dirección recibe en Mis tareas «Aprobar el contrato …» y lo aprueba
//   o lo devuelve. Quien lo elaboró no lo decide.
// - Aprobación del otrosí: igual, para cada otrosí.
// - Vencimiento: a 90, 60 y 30 días del fin, el responsable del contrato recibe «Revisar el
//   vencimiento …» y la cierra cuando decide (prorrogar, renovar o dejarlo terminar).

export const CONTRACT_FLOW = 'ctr.contract';
export const AMENDMENT_FLOW = 'ctr.amendment';
export const EXPIRY_FLOW = 'ctr.expiry';

export const APPROVAL_STATES = {
  approval: 'approval',
  approved: 'approved',
  returned: 'returned',
} as const;

export const APPROVAL_ACTIONS = { approve: 'approve', return: 'return' } as const;

/** Dos días hábiles para decidir. */
const APPROVAL_SLA_HOURS = 16;

/** Cinco días hábiles para atender el vencimiento. */
const EXPIRY_SLA_HOURS = 40;

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
    required_permission: 'contract.approve',
    condition: null,
    requires_comment: comment,
  } satisfies TransitionInput;
}

function approvalFlow(key: string, name: string, description: string, label: string) {
  return {
    key,
    name,
    description,
    entityType: key,
    states: [
      state('approval', label, 'initial', {
        sla_hours: APPROVAL_SLA_HOURS,
        priority: 'high',
        assignee: { type: 'role', role: 'DIRECCION' },
      }),
      state('approved', 'Aprobado', 'final', {}),
      state('returned', 'Devuelto para corregir', 'final', {}),
    ],
    transitions: [
      step('approval', 'approved', 'approve', 'Aprobar', false),
      step('approval', 'returned', 'return', 'Devolver para corregir', true),
    ],
  };
}

export const CONTRACT_FLOW_DATA = approvalFlow(
  CONTRACT_FLOW,
  'Aprobación de contratos',
  'Ficha 17.7: la Dirección aprueba o devuelve el contrato; revisa una por una las cláusulas modificadas.',
  'Aprobar el contrato',
);

export const AMENDMENT_FLOW_DATA = approvalFlow(
  AMENDMENT_FLOW,
  'Aprobación de otrosíes',
  'Ficha 17.7: la Dirección aprueba o devuelve el otrosí de un contrato vigente.',
  'Aprobar el otrosí',
);

export const EXPIRY_FLOW_DATA = {
  key: EXPIRY_FLOW,
  name: 'Vencimiento de contratos',
  description:
    'Ficha 17.7: el responsable del contrato revisa su vencimiento a 90, 60 y 30 días y decide.',
  entityType: EXPIRY_FLOW,
  states: [
    state('review', 'Revisar el vencimiento', 'initial', {
      sla_hours: EXPIRY_SLA_HOURS,
      priority: 'high',
      assignee: { type: 'initiator' },
    }),
    state('done', 'Atendido', 'final', {}),
  ],
  transitions: [
    {
      from_state: 'review',
      to_state: 'done',
      action: 'done',
      label: 'Marcar como atendido',
      required_permission: 'contract.read',
      condition: null,
      requires_comment: true,
    } satisfies TransitionInput,
  ],
};

// - Firma de la empresa (B25): cuando firmaron todos los del cliente, la persona de la Dirección que
//   firma por la empresa recibe «Firmar …». Firma desde la ficha, donde confirma que es ella; la
//   tarea se cierra sola al firmar, o si el proceso se rechaza, se anula o vence.
export const SIGNATURE_FLOW = 'sig.company';

export const SIGNATURE_STATES = { sign: 'sign', signed: 'signed', closed: 'closed' } as const;

export const SIGNATURE_ACTIONS = { sign: 'sign', close: 'close' } as const;

export const SIGNATURE_FLOW_DATA = {
  key: SIGNATURE_FLOW,
  name: 'Firma de la empresa',
  description:
    'Capítulo 19: la Dirección firma de última, desde la ficha del contrato, con su sesión y su segundo factor.',
  entityType: SIGNATURE_FLOW,
  states: [
    state('sign', 'Firmar por la empresa', 'initial', {
      sla_hours: APPROVAL_SLA_HOURS,
      priority: 'high',
      assignee: { type: 'initiator' },
    }),
    state('signed', 'Firmado', 'final', {}),
    state('closed', 'Cerrado sin firmar', 'final', {}),
  ],
  transitions: [
    {
      from_state: 'sign',
      to_state: 'signed',
      action: 'sign',
      label: 'Firmar desde la ficha',
      required_permission: 'contract.read',
      condition: null,
      requires_comment: false,
    } satisfies TransitionInput,
    {
      from_state: 'sign',
      to_state: 'closed',
      action: 'close',
      label: 'Cerrar',
      required_permission: 'signature.envelope.cancel',
      condition: null,
      requires_comment: true,
    } satisfies TransitionInput,
  ],
};
