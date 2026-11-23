import type { StateInput, TransitionInput } from '@arza/contracts';

import type { SeedFlow } from '../../wf/index.js';

// Trámite de una solicitud de titular en el motor (B42, ficha 17.19; decisión 5). El Oficial de
// Protección de Datos recibe en Mis tareas «Atender la solicitud …» con la fecha límite legal en
// días hábiles; la fecha se mueve con la prórroga o mientras el reclamo espera que lo completen, y
// la tarea se cierra sola cuando la solicitud se cierra.

export const REQUEST_FLOW = 'prv.request';

/** Acción con la que Privacidad cierra el trámite. */
export const REQUEST_FLOW_DONE = 'done';

const states: StateInput[] = [
  {
    key: 'attend',
    label: 'Atender la solicitud',
    kind: 'initial',
    sla_hours: null,
    priority: 'high',
    assignee: { type: 'role', role: 'OFICIAL_DATOS' },
    approval: null,
  },
  {
    key: 'done',
    label: 'Atendida',
    kind: 'final',
    sla_hours: null,
    priority: 'normal',
    assignee: null,
    approval: null,
  },
];

const transitions: TransitionInput[] = [
  {
    from_state: 'attend',
    to_state: 'done',
    action: REQUEST_FLOW_DONE,
    label: 'Cerrar la solicitud',
    required_permission: 'privacy.request.manage',
    condition: null,
    requires_comment: false,
  },
];

export const REQUEST_FLOW_DATA: SeedFlow = {
  key: REQUEST_FLOW,
  name: 'Solicitudes de titulares',
  description:
    'Ficha 17.19: consultas en 10 días hábiles (prorrogables 5) y reclamos en 15 (prorrogables 8), Ley 1581 de 2012, arts. 14 y 15.',
  entityType: REQUEST_FLOW,
  states,
  transitions,
};
