import {
  compensationListResponseSchema,
  slaPolicyListResponseSchema,
  ticketDetailSchema,
} from '@arza/contracts';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { tenantScope } from '../../iam/support/iam-fixtures.js';
import { created, day, put, versioned, type PendingRequest } from './contract-steps.js';
import type { RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para la mesa de ayuda (B28): el tiquete y su recorrido,
// la conversación, las compensaciones, los acuerdos de tiempo y las garantías. Cada una registra un
// tiquete nuevo por la API, a nombre de una persona de Servicio al cliente.

const TICKET = {
  subject: 'No carga el reporte de ventas',
  description: 'Desde esta mañana el reporte queda en blanco.',
  category: 'incident',
  priority: 'high',
};

interface Desk {
  readonly agent: Person;
  readonly approver: Person;
  readonly id: string;
  readonly base: string;
}

async function desk(s: AccessScenario): Promise<Desk> {
  const agent = await s.person('servicio-recorrido', ['SERVICIO']);
  const approver = await s.person('servicio-aprueba-recorrido', ['SERVICIO']);
  const id = await created(s.post('/v1/tickets', agent.session, TICKET));
  return { agent, approver, id, base: `/v1/tickets/${id}` };
}

async function version(s: AccessScenario, d: Desk): Promise<number> {
  return ticketDetailSchema.parse((await s.get(d.base, d.agent.session)).body).version;
}

async function step(
  s: AccessScenario,
  d: Desk,
  action: string,
  body: object = {},
): Promise<PendingRequest> {
  const current = await version(s, d);
  return { test: versioned(s.post(`${d.base}/actions/${action}`, d.agent.session, body), current) };
}

/** Avanza el tiquete por los pasos dados, uno tras otro. */
async function through(s: AccessScenario, d: Desk, steps: [string, object][]): Promise<void> {
  for (const [action, body] of steps) await (await step(s, d, action, body)).test;
}

const ASSIGNED = (d: Desk): [string, object] => ['assign', { assignee_id: d.agent.id }];
const RESOLVED: [string, object] = ['resolve', { resolution: 'Se reconstruyó el índice.' }];

async function withCompensation(s: AccessScenario): Promise<Desk & { compensation: string }> {
  const d = await desk(s);
  await through(s, d, [ASSIGNED(d)]);
  const compensation = await created(
    s.post(`${d.base}/compensations`, d.agent.session, {
      type: 'support_hours',
      hours: 2,
      reason: 'Se superó el plazo de solución.',
    }),
  );
  return { ...d, compensation };
}

async function compensationVersion(s: AccessScenario, d: Desk, id: string): Promise<number> {
  const list = compensationListResponseSchema.parse(
    (await s.get(`${d.base}/compensations`, d.agent.session)).body,
  );
  return list.data.find((row) => row.id === id)?.version ?? 0;
}

/** Una garantía de un entregable ficticio, como la que nace al aceptarlo en Proyectos. */
async function warranty(s: AccessScenario): Promise<string> {
  const row = await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) =>
    tx.svcWarranty.create({
      data: {
        tenantId: s.tenant.id,
        projectId: crypto.randomUUID(),
        deliverableId: crypto.randomUUID(),
        startsOn: new Date(`${day(s, 0)}T00:00:00Z`),
        endsOn: new Date(`${day(s, 90)}T00:00:00Z`),
        scope: 'Corrección de fallas del entregable.',
      },
    }),
  );
  return row.id;
}

export const SERVICE_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/tickets': async (s) => {
    const agent = await s.person('servicio-recorrido', ['SERVICIO']);
    return { test: s.post('/v1/tickets', agent.session, TICKET) };
  },
  'PUT /v1/tickets/{id}': async (s) => {
    const d = await desk(s);
    const body = { ...TICKET, priority: 'critical' };
    return { test: versioned(put(s, d.base, d.agent, body), await version(s, d)) };
  },
  'POST /v1/tickets/{id}/actions/assign': async (s) => {
    const d = await desk(s);
    return step(s, d, 'assign', { assignee_id: d.agent.id });
  },
  'POST /v1/tickets/{id}/actions/escalate': async (s) => {
    const d = await desk(s);
    return step(s, d, 'escalate', { assignee_id: d.agent.id, reason: 'Requiere al líder.' });
  },
  'POST /v1/tickets/{id}/actions/start': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d)]);
    return step(s, d, 'start');
  },
  'POST /v1/tickets/{id}/actions/wait': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d), ['start', {}]]);
    return step(s, d, 'wait', { note: 'Envíenos una captura de pantalla.' });
  },
  'POST /v1/tickets/{id}/actions/resume': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d), ['start', {}], ['wait', { note: null }]]);
    return step(s, d, 'resume');
  },
  'POST /v1/tickets/{id}/actions/resolve': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d), ['start', {}]]);
    return step(s, d, 'resolve', { resolution: 'Se reconstruyó el índice.' });
  },
  'POST /v1/tickets/{id}/actions/reopen': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d), ['start', {}], RESOLVED]);
    return step(s, d, 'reopen', { reason: 'Volvió a fallar.' });
  },
  'POST /v1/tickets/{id}/actions/close': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d), ['start', {}], RESOLVED]);
    return step(s, d, 'close');
  },
  'POST /v1/tickets/{id}/messages': async (s) => {
    const d = await desk(s);
    return { test: s.post(`${d.base}/messages`, d.agent.session, { body: 'Ya lo revisamos.' }) };
  },
  'POST /v1/tickets/{id}/compensations': async (s) => {
    const d = await desk(s);
    await through(s, d, [ASSIGNED(d)]);
    const body = { type: 'discount', amount: '150000', reason: 'Se superó el plazo.' };
    return { test: s.post(`${d.base}/compensations`, d.agent.session, body) };
  },
  'POST /v1/tickets/{id}/compensations/{compensationId}/actions/decide': async (s) => {
    const d = await withCompensation(s);
    const path = `${d.base}/compensations/${d.compensation}/actions/decide`;
    const current = await compensationVersion(s, d, d.compensation);
    return { test: versioned(s.post(path, d.approver.session, { approve: true }), current) };
  },
  'POST /v1/tickets/{id}/compensations/{compensationId}/actions/apply': async (s) => {
    const d = await withCompensation(s);
    const base = `${d.base}/compensations/${d.compensation}/actions`;
    const first = await compensationVersion(s, d, d.compensation);
    await versioned(s.post(`${base}/decide`, d.approver.session, { approve: true }), first);
    const current = await compensationVersion(s, d, d.compensation);
    const body = { applied_on: day(s, 0) };
    return { test: versioned(s.post(`${base}/apply`, d.approver.session, body), current) };
  },
  'PUT /v1/sla-policies/{id}': async (s) => {
    const agent = await s.person('servicio-recorrido', ['SERVICIO']);
    const list = slaPolicyListResponseSchema.parse(
      (await s.get('/v1/sla-policies', agent.session)).body,
    );
    const policy = list.data.find((row) => row.priority === 'low');
    const body = { first_response_hours: 16, resolution_hours: 72, calendar: 'business' };
    return {
      test: versioned(
        put(s, `/v1/sla-policies/${policy?.id ?? ''}`, agent, body),
        policy?.version ?? 0,
      ),
    };
  },
  'PUT /v1/warranties/{id}': async (s) => {
    const agent = await s.person('servicio-recorrido', ['SERVICIO']);
    const id = await warranty(s);
    const body = { ends_on: day(s, 120), scope: 'Fallas del entregable y su instalación.' };
    return { test: versioned(put(s, `/v1/warranties/${id}`, agent, body), 1) };
  },
};
