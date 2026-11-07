// Datos ficticios de las pruebas de la mesa de ayuda (B28).

import type { PermissionCode, TicketDetail } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { ORG_ID, PERSON_SUMMARY } from './party-fixtures';

type Handler = Parameters<typeof mockApi>[0][string];
type Routes = Record<string, Handler>;

export const TICKET_ID = '01999a00-0000-7000-8000-0000000f8001';
export const COMPENSATION_ID = '01999a00-0000-7000-8000-0000000f8101';
export const POLICY_ID = '01999a00-0000-7000-8000-0000000f8201';
export const WARRANTY_ID = '01999a00-0000-7000-8000-0000000f8301';
export const AGENT = { id: SESSION.user.id, name: 'Lucía Servicio' };
export const OTHER_AGENT = { id: '01999a00-0000-7000-8000-00000000a009', name: 'Tomás Soporte' };

function grantsOf(codes: readonly PermissionCode[], scope: 'all' | 'own' = 'all'): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c030', code: 'SERVICIO', name: 'Servicio' }],
    permissions: codes.map((code) => ({ code, scope })),
  };
}

export const SERVICE_AGENT = grantsOf([
  'service.ticket.read',
  'service.ticket.create',
  'service.ticket.assign',
  'service.ticket.resolve',
  'service.ticket.close',
  'service.compensation.approve',
  'service.sla.manage',
  'party.read',
]);

export const COLLEAGUE = grantsOf(['service.ticket.read', 'service.ticket.create'], 'own');

const CAN_ALL = {
  update: true,
  assign: true,
  work: true,
  reopen: false,
  close: false,
  write_internal: true,
  write_public: true,
  propose_compensation: true,
  decide_compensation: true,
};

export function ticketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: TICKET_ID,
    code: 'TIQ-2026-0001',
    subject: 'No carga el reporte de ventas',
    status: 'in_progress',
    priority: 'critical',
    level: 1,
    category: 'incident',
    party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
    assignee: AGENT,
    requester: null,
    response_due_at: '2026-11-06T16:00:00.000Z',
    resolution_due_at: '2026-11-06T19:00:00.000Z',
    first_response_at: null,
    clock: 'at_risk',
    in_warranty: true,
    created_at: '2026-11-06T15:00:00.000Z',
    description: 'Desde esta mañana el reporte queda en blanco.',
    channel: 'phone',
    requester_name: 'Ana Gómez',
    project: { id: '01999a00-0000-7000-8000-0000000e0001', code: 'PRY-2026-0001', name: 'Portal' },
    deliverable: { id: '01999a00-0000-7000-8000-0000000e0901', name: 'Portal de autogestión' },
    warranty: { id: WARRANTY_ID, ends_on: '2027-02-04' },
    sla: { calendar: 'continuous', first_response_hours: 1, resolution_hours: 4 },
    paused_at: null,
    resolved_at: null,
    resolution: null,
    auto_close_at: null,
    closed_at: null,
    created_by: AGENT,
    version: 3,
    can: CAN_ALL,
    ...overrides,
  };
}

const SUMMARY = {
  id: TICKET_ID,
  code: 'TIQ-2026-0001',
  subject: 'No carga el reporte de ventas',
  status: 'in_progress',
  priority: 'critical',
  level: 1,
  category: 'incident',
  party: null,
  assignee: null,
  requester: { id: OTHER_AGENT.id, name: 'Pedro Colaborador' },
  response_due_at: null,
  resolution_due_at: '2026-11-06T19:00:00.000Z',
  first_response_at: null,
  clock: 'overdue',
  in_warranty: true,
  created_at: '2026-11-06T15:00:00.000Z',
};

const MESSAGES = [
  {
    id: '01999a00-0000-7000-8000-0000000f8401',
    author: AGENT,
    body: 'Revisar los registros del servidor.',
    is_internal: true,
    from_client: false,
    created_at: '2026-11-06T15:05:00.000Z',
  },
  {
    id: '01999a00-0000-7000-8000-0000000f8402',
    author: null,
    body: 'Ya envié la captura.',
    is_internal: false,
    from_client: true,
    created_at: '2026-11-06T15:10:00.000Z',
  },
];

const COMPENSATIONS = [
  {
    id: COMPENSATION_ID,
    ticket: { id: TICKET_ID, code: 'TIQ-2026-0001' },
    type: 'discount',
    amount: '150000.00',
    hours: null,
    days: null,
    reason: 'Se superó el plazo de solución.',
    status: 'proposed',
    proposed_by: OTHER_AGENT,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    applied_on: null,
    created_at: '2026-11-06T15:20:00.000Z',
    version: 1,
  },
  {
    id: '01999a00-0000-7000-8000-0000000f8102',
    ticket: { id: TICKET_ID, code: 'TIQ-2026-0001' },
    type: 'support_hours',
    amount: null,
    hours: 2.5,
    days: null,
    reason: 'Horas de ajuste.',
    status: 'approved',
    proposed_by: OTHER_AGENT,
    decided_by: AGENT,
    decided_at: '2026-11-06T15:30:00.000Z',
    decision_note: null,
    applied_on: null,
    created_at: '2026-11-06T15:21:00.000Z',
    version: 2,
  },
];

const POLICIES = ['critical', 'high', 'medium', 'low'].map((priority, index) => ({
  id: index === 0 ? POLICY_ID : `01999a00-0000-7000-8000-0000000f820${String(index + 1)}`,
  priority,
  first_response_hours: index === 0 ? 1 : 4 * index,
  resolution_hours: index === 0 ? 4 : 16 * index,
  calendar: index === 0 ? 'continuous' : 'business',
  version: 1,
}));

export const WARRANTY = {
  id: WARRANTY_ID,
  project: { id: '01999a00-0000-7000-8000-0000000e0001', code: 'PRY-2026-0001', name: 'Portal' },
  deliverable: { id: '01999a00-0000-7000-8000-0000000e0901', name: 'Portal de autogestión' },
  party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
  starts_on: '2026-11-06',
  ends_on: '2027-02-04',
  scope: 'Corrección de fallas del entregable.',
  active: true,
  version: 1,
};

/** La API de la mesa de ayuda, con lo que se pida encima. */
export function serveService(permissions: object, extra: Routes = {}): SentRequest[] {
  const base = `/v1/tickets/${TICKET_ID}`;
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/tickets': () => json({ data: [SUMMARY], next_cursor: null }),
    'GET /v1/tickets/options': () => json({ assignees: [AGENT, OTHER_AGENT] }),
    [`GET ${base}`]: () => json(ticketDetail()),
    [`GET ${base}/messages`]: () => json({ data: MESSAGES }),
    [`GET ${base}/compensations`]: () => json({ data: COMPENSATIONS }),
    'GET /v1/sla-policies': () => json({ data: POLICIES, can_manage: true }),
    'GET /v1/warranties': () => json({ data: [WARRANTY], can_manage: true }),
    'GET /v1/parties': () => json({ data: [PERSON_SUMMARY], next_cursor: null }),
    ...extra,
  });
}

/** La ficha del tiquete con lo que se pida. */
export function ticketRoute(overrides: Partial<TicketDetail>): Routes {
  return { [`GET /v1/tickets/${TICKET_ID}`]: () => json(ticketDetail(overrides)) };
}
