import type { StateInput, TransitionInput } from '@arza/contracts';

import type { SeedFlow } from '../../wf/index.js';

// Flujo de seguimiento de la propiedad intelectual en el motor (B40, decisiones 6 y 7). El
// responsable del activo recibe en Mis tareas «Renovar …» cuando llega la fecha de aviso de una
// marca o un dominio, o «Radicar el registro de …» cuando se libera una versión de un producto
// propio, y la cierra cuando la atiende. Administración › Flujos lo puede ajustar sin programar.

export const IP_FOLLOW_UP_FLOW = 'inn.ip';

/** Cinco días hábiles para atenderla. */
const FOLLOW_UP_SLA_HOURS = 40;

const states: StateInput[] = [
  {
    key: 'review',
    label: 'Atender el activo',
    kind: 'initial',
    sla_hours: FOLLOW_UP_SLA_HOURS,
    priority: 'high',
    assignee: { type: 'initiator' },
    approval: null,
  },
  {
    key: 'done',
    label: 'Atendido',
    kind: 'final',
    sla_hours: null,
    priority: 'normal',
    assignee: null,
    approval: null,
  },
];

const transitions: TransitionInput[] = [
  {
    from_state: 'review',
    to_state: 'done',
    action: 'done',
    label: 'Marcar como atendido',
    required_permission: null,
    condition: null,
    requires_comment: true,
  },
];

export const IP_FOLLOW_UP_FLOW_DATA: SeedFlow = {
  key: IP_FOLLOW_UP_FLOW,
  name: 'Seguimiento de la propiedad intelectual',
  description:
    'Ficha 17.16: renovación de marcas (6 meses antes) y dominios (60 días antes), y radicación del registro de cada versión liberada.',
  entityType: IP_FOLLOW_UP_FLOW,
  states,
  transitions,
};
