// Datos ficticios de las pruebas de las pantallas de flujos y tareas (B15). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION } from './fake-api';

export const TASK_ID = '01999a00-0000-7000-8000-0000000e0001';
export const INSTANCE_ID = '01999a00-0000-7000-8000-0000000e0002';
export const DEFINITION_ID = '01999a00-0000-7000-8000-0000000e0003';
const LUIS_ID = '01999a00-0000-7000-8000-00000000a002';

const ANA = { id: SESSION.user.id, email: 'ana@demo-uno.test', display_name: 'Ana Pérez' };
export const LUIS = { id: LUIS_ID, email: 'luis@demo-uno.test', display_name: null };

function grants(codes: readonly PermissionCode[], scope: 'all' | 'own') {
  return codes.map((code) => ({ code, scope }));
}

/** Colaborador: atiende sus tareas. */
export const WORKER = {
  roles: [{ id: '01999a00-0000-7000-8000-00000000c012', code: 'COLABORADOR', name: 'Colaborador' }],
  permissions: grants(['wf.task.work'], 'own'),
};

/** Administrador de plataforma: flujos, tablero y reasignación. */
export const WF_ADMIN = {
  roles: [{ id: '01999a00-0000-7000-8000-00000000c010', code: 'ADMIN_PLATAFORMA', name: 'Admin' }],
  permissions: [
    ...grants(
      ['wf.definition.manage', 'wf.task.read_all', 'wf.task.reassign', 'iam.role.read'],
      'all',
    ),
    ...grants(['wf.task.work'], 'own'),
  ],
};

const DRAFT = { key: 'draft', label: 'Borrador', kind: 'initial' } as const;
const REVIEW = { key: 'review', label: 'Revisión', kind: 'approval' } as const;

export function taskSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TASK_ID,
    title: 'Borrador: Compra de portátiles',
    kind: 'action',
    status: 'pending',
    priority: 'high',
    due_at: '2026-10-16T21:00:00.000Z',
    assignee: ANA,
    assignee_role: null,
    escalated_to: null,
    escalated_at: null,
    delegated_from: null,
    instance: {
      id: INSTANCE_ID,
      title: 'Compra de portátiles',
      workflow_name: 'Solicitud de prueba',
      state: DRAFT,
    },
    reason: 'assigned',
    created_at: '2026-10-15T14:00:00.000Z',
    completed_at: null,
    ...overrides,
  };
}

const HISTORY = [
  {
    id: '01999a00-0000-7000-8000-0000000e0101',
    from_state: null,
    to_state: DRAFT,
    action: 'start',
    action_label: 'Inició el trámite',
    actor: ANA,
    on_behalf_of: null,
    comment: null,
    occurred_at: '2026-10-15T14:00:00.000Z',
  },
  {
    id: '01999a00-0000-7000-8000-0000000e0102',
    from_state: REVIEW,
    to_state: REVIEW,
    action: 'reject',
    action_label: 'Rechazó',
    actor: LUIS,
    on_behalf_of: ANA,
    comment: 'Falta la cotización',
    occurred_at: '2026-10-15T15:00:00.000Z',
  },
];

const SUBMIT = {
  action: 'submit',
  label: 'Enviar a revisión',
  to_state: REVIEW,
  requires_comment: false,
  condition_met: true,
};

const TO_DIRECTION = {
  action: 'submit_direction',
  label: 'Enviar a Dirección',
  to_state: { key: 'direction', label: 'Dirección', kind: 'approval' },
  requires_comment: false,
  condition_met: false,
};

export function taskView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...taskSummary(),
    can_act: true,
    actions: [SUBMIT, TO_DIRECTION],
    history: HISTORY,
    ...overrides,
  };
}

export function instanceView(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: INSTANCE_ID,
    title: 'Compra de portátiles',
    entity_type: 'demo.request',
    entity_id: '01999a00-0000-7000-8000-0000000e0004',
    workflow: { id: DEFINITION_ID, key: 'demo.request', name: 'Solicitud de prueba', version: 1 },
    state: DRAFT,
    started_by: ANA,
    started_at: '2026-10-15T14:00:00.000Z',
    due_at: '2026-10-16T21:00:00.000Z',
    completed_at: null,
    row_version: 3,
    actions: [{ ...SUBMIT, label: 'Cancelar', action: 'cancel', requires_comment: true }],
    tasks: [taskSummary({ reason: null })],
    history: HISTORY,
    ...overrides,
  };
}
