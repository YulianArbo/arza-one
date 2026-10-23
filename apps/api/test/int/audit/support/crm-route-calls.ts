import { createdResponseSchema, leadDetailSchema, opportunityDetailSchema } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { seedCrmWorkflows } from '../../../../src/modules/crm/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { consentFor, organizationBody, uniqueNumber } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Llamadas del recorrido de escrituras (B11) para las rutas del CRM (B22). Lo que cada llamada
// necesita se prepara por la API, con una persona de Comercial.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const CAMPAIGN = { name: 'Campaña', channel: 'email', starts_on: '2026-10-01' };

async function sales(s: AccessScenario): Promise<Person> {
  await consentFor(s);
  await seedCrmWorkflows(apiDatabase(), [s.tenant.id], systemClock);
  return s.person('comercial-crm-recorrido', ['COMERCIAL']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

function versioned(test: request.Test, version: number): request.Test {
  return test.set('If-Match', `"${String(version)}"`);
}

async function lead(s: AccessScenario, person: Person): Promise<{ id: string; version: number }> {
  const body = {
    person: {
      first_name: 'Prospecto',
      last_name: `Recorrido ${uniqueNumber()}`,
      email: null,
      phone: '3105550101',
    },
    need: 'Necesita un portal de clientes.',
    source: 'WEBSITE',
    consent: await consentFor(s),
  };
  const id = await created(s.post('/v1/crm/leads', person.session, body));
  const detail = leadDetailSchema.parse((await s.get(`/v1/crm/leads/${id}`, person.session)).body);
  return { id, version: detail.version };
}

async function qualified(s: AccessScenario, person: Person) {
  const { id, version } = await lead(s, person);
  await versioned(s.post(`/v1/crm/leads/${id}/actions/qualify`, person.session), version);
  const detail = leadDetailSchema.parse((await s.get(`/v1/crm/leads/${id}`, person.session)).body);
  return detail;
}

async function opportunity(
  s: AccessScenario,
  person: Person,
): Promise<{ id: string; version: number }> {
  const party = await created(s.post('/v1/parties', person.session, organizationBody()));
  const body = {
    party_id: party,
    title: 'Portal',
    estimated_value: '1000.00',
    expected_close: '2026-12-01',
  };
  const id = await created(s.post('/v1/crm/opportunities', person.session, body));
  const detail = opportunityDetailSchema.parse(
    (await s.get(`/v1/crm/opportunities/${id}`, person.session)).body,
  );
  return { id, version: detail.version };
}

async function activity(s: AccessScenario, person: Person): Promise<string> {
  const { id } = await lead(s, person);
  const body = { lead_id: id, type: 'call', subject: 'Llamada', due_at: '2026-12-01T15:00:00Z' };
  return created(s.post('/v1/crm/activities', person.session, body));
}

const LEAD_CALLS: Record<string, RouteCall> = {
  'POST /v1/crm/leads': async (s) => {
    const person = await sales(s);
    const body = {
      person: { first_name: 'Ana', last_name: 'Recorrido', email: 'ana@example.com', phone: null },
      need: 'Necesita soporte.',
      source: 'WEBSITE',
      consent: await consentFor(s),
    };
    return { test: s.post('/v1/crm/leads', person.session, body) };
  },
  'PATCH /v1/crm/leads/{id}': async (s) => {
    const person = await sales(s);
    const { id, version } = await lead(s, person);
    const body = { need: 'Otra necesidad.', source: 'EVENT' };
    return { test: s.patch(`/v1/crm/leads/${id}`, person.session, body, version) };
  },
  'POST /v1/crm/leads/{id}/actions/qualify': async (s) => {
    const person = await sales(s);
    const { id, version } = await lead(s, person);
    return {
      test: versioned(s.post(`/v1/crm/leads/${id}/actions/qualify`, person.session), version),
    };
  },
  'POST /v1/crm/leads/{id}/actions/discard': async (s) => {
    const person = await sales(s);
    const { id, version } = await lead(s, person);
    const path = `/v1/crm/leads/${id}/actions/discard`;
    return { test: versioned(s.post(path, person.session, { reason: 'DUPLICATE' }), version) };
  },
  'POST /v1/crm/leads/{id}/actions/convert': async (s) => {
    const person = await sales(s);
    const detail = await qualified(s, person);
    const body = {
      party_id: detail.person.id,
      title: 'Portal',
      estimated_value: '10.00',
      expected_close: '2026-12-01',
    };
    const path = `/v1/crm/leads/${detail.id}/actions/convert`;
    return { test: versioned(s.post(path, person.session, body), detail.version) };
  },
};

const OPPORTUNITY_CALLS: Record<string, RouteCall> = {
  'POST /v1/crm/opportunities': async (s) => {
    const person = await sales(s);
    const party = await created(s.post('/v1/parties', person.session, organizationBody()));
    const body = {
      party_id: party,
      title: 'Portal',
      estimated_value: '1.00',
      expected_close: '2026-12-01',
    };
    return { test: s.post('/v1/crm/opportunities', person.session, body) };
  },
  'PATCH /v1/crm/opportunities/{id}': async (s) => {
    const person = await sales(s);
    const { id, version } = await opportunity(s, person);
    const body = {
      title: 'Otro',
      estimated_value: '2.00',
      expected_close: '2026-12-02',
      probability: 20,
    };
    return { test: s.patch(`/v1/crm/opportunities/${id}`, person.session, body, version) };
  },
  'POST /v1/crm/opportunities/{id}/actions/move': async (s) => {
    const person = await sales(s);
    const { id, version } = await opportunity(s, person);
    const path = `/v1/crm/opportunities/${id}/actions/move`;
    return { test: versioned(s.post(path, person.session, { stage: 'proposal' }), version) };
  },
  'POST /v1/crm/opportunities/{id}/actions/win': async (s) => {
    const person = await sales(s);
    const { id, version } = await opportunity(s, person);
    return {
      test: versioned(s.post(`/v1/crm/opportunities/${id}/actions/win`, person.session), version),
    };
  },
  'POST /v1/crm/opportunities/{id}/actions/lose': async (s) => {
    const person = await sales(s);
    const { id, version } = await opportunity(s, person);
    const path = `/v1/crm/opportunities/${id}/actions/lose`;
    return { test: versioned(s.post(path, person.session, { reason: 'PRICE' }), version) };
  },
};

const OTHER_CALLS: Record<string, RouteCall> = {
  'POST /v1/crm/activities': async (s) => {
    const person = await sales(s);
    const { id } = await lead(s, person);
    const body = { lead_id: id, type: 'call', subject: 'Llamada', due_at: '2026-12-01T15:00:00Z' };
    return { test: s.post('/v1/crm/activities', person.session, body) };
  },
  'PATCH /v1/crm/activities/{id}': async (s) => {
    const person = await sales(s);
    const id = await activity(s, person);
    const body = { type: 'meeting', subject: 'Reunión', due_at: '2026-12-02T15:00:00Z' };
    return { test: s.patch(`/v1/crm/activities/${id}`, person.session, body, 1) };
  },
  'POST /v1/crm/activities/{id}/actions/complete': async (s) => {
    const person = await sales(s);
    const id = await activity(s, person);
    const path = `/v1/crm/activities/${id}/actions/complete`;
    return { test: versioned(s.post(path, person.session, { outcome: 'Contestó' }), 1) };
  },
  'POST /v1/crm/campaigns': async (s) => {
    const person = await sales(s);
    const body = { ...CAMPAIGN, name: `Campaña ${uniqueNumber()}` };
    return { test: s.post('/v1/crm/campaigns', person.session, body) };
  },
  'PUT /v1/crm/campaigns/{id}': async (s) => {
    const person = await sales(s);
    const body = { ...CAMPAIGN, name: `Campaña ${uniqueNumber()}` };
    const id = await created(s.post('/v1/crm/campaigns', person.session, body));
    const test = request(s.app.getHttpServer())
      .put(`/v1/crm/campaigns/${id}`)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', person.session.cookie)
      .set('X-CSRF-Token', person.session.session.csrf_token)
      .set('If-Match', '"1"')
      .send({ ...body, ends_on: '2026-10-31' });
    return { test };
  },
  'POST /v1/crm/reports/funnel/export': async (s) => {
    const person = await sales(s);
    return { test: s.post('/v1/crm/reports/funnel/export', person.session, {}) };
  },
};

export const CRM_ROUTE_CALLS: Record<string, RouteCall> = {
  ...LEAD_CALLS,
  ...OPPORTUNITY_CALLS,
  ...OTHER_CALLS,
};
