import type { FormFlowKey, StateInput, TransitionInput } from '@arza/contracts';

// Flujos de aprobación de los registros diligenciados (B20, ADR-011): datos que el motor publica
// en cada empresa la primera vez. Administración › Flujos los puede ajustar sin programar (por
// ejemplo, quién aprueba), siempre que conserve las claves de los estados y de las acciones.

/** Tipo de registro del motor para todos los registros diligenciados. */
export const FORM_RECORD_ENTITY = 'doc.form_record';

export const FORM_RECORD_STATES = {
  filling: 'filling',
  approval: 'approval',
  approved: 'approved',
} as const;

const quality = { type: 'role', role: 'CALIDAD' } as const;
const direction = { type: 'role', role: 'DIRECCION' } as const;

type Approver = typeof quality | typeof direction;

function step(from: string, to: string, action: string, label: string): TransitionInput {
  return {
    from_state: from,
    to_state: to,
    action,
    label,
    required_permission: action === 'submit' ? 'doc.form_record.create' : 'doc.form_record.approve',
    condition: null,
    requires_comment: action === 'reject',
  };
}

function states(approver: Approver, approvedBy: string): StateInput[] {
  const base = { sla_hours: null, priority: 'normal', assignee: null, approval: null } as const;
  return [
    {
      ...base,
      key: 'filling',
      label: 'Diligenciamiento',
      kind: 'initial',
      assignee: { type: 'initiator' },
    },
    {
      ...base,
      key: 'approval',
      label: `Aprobación de ${approvedBy}`,
      kind: 'approval',
      sla_hours: 16,
      approval: { mode: 'serial', approvers: [approver] },
    },
    { ...base, key: 'approved', label: 'Aprobado', kind: 'final' },
  ];
}

function flowData(key: FormFlowKey, name: string, approver: Approver, approvedBy: string) {
  return {
    key,
    name,
    description: `Quien diligencia el formato lo envía y ${approvedBy} lo aprueba o lo devuelve.`,
    entityType: FORM_RECORD_ENTITY,
    states: states(approver, approvedBy),
    transitions: [
      step('filling', 'approval', 'submit', 'Enviar a aprobación'),
      step('approval', 'approved', 'approve', 'Aprobar'),
      step('approval', 'filling', 'reject', 'Devolver para corregir'),
    ],
  };
}

export const FORM_FLOW_DATA = [
  flowData(
    'doc.form_record.direction',
    'Aprobación de formatos por Dirección',
    direction,
    'Dirección',
  ),
  flowData('doc.form_record.quality', 'Aprobación de formatos por Calidad', quality, 'Calidad'),
];
