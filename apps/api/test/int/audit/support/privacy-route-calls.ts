import { createdResponseSchema, consentListResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { consentFor, organizationBody, personBody } from '../../party/support/party-scenario.js';

// Llamadas del recorrido de escrituras (B11) para las rutas de privacidad (B17). Lo que cada
// llamada necesita se prepara por la API.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const BODY = 'Texto del recorrido de auditoría con la extensión mínima que exige la plataforma.';
const ACTIVITY = {
  name: 'Recorrido',
  purpose: 'Probar que toda escritura queda en la auditoría',
  data_categories: ['contact'],
  holder_types: ['customers'],
  legal_basis: 'Autorización del titular (Ley 1581, art. 9)',
  retention: 'Un año',
};

function officer(s: AccessScenario): Promise<Person> {
  return s.person('oficial-recorrido', ['OFICIAL_DATOS']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

function withVersion(test: request.Test, version: number): request.Test {
  return test.set('If-Match', `"${String(version)}"`);
}

/** Borrador de una clase; cada llamada usa una clase distinta porque hay uno a la vez. */
async function draft(s: AccessScenario, person: Person, key: string, purposes: string[]) {
  await consentFor(s);
  const body = { key, title: 'Borrador del recorrido', body: BODY, purposes };
  return created(s.post('/v1/notices', person.session, body));
}

/** Persona registrada con su autorización por una persona de comercial. */
async function person(s: AccessScenario) {
  const sales = await s.person('comercial-recorrido', ['COMERCIAL']);
  const body = { ...personBody(), consent: await consentFor(s) };
  return { sales, id: await created(s.post('/v1/parties', sales.session, body)) };
}

async function processor(s: AccessScenario, dpo: Person): Promise<string> {
  const sales = await s.person('comercial-recorrido', ['COMERCIAL']);
  const party = await created(s.post('/v1/parties', sales.session, organizationBody()));
  const body = { party_id: party, service: 'Nube', country: 'US', review_on: '2027-01-31' };
  return created(s.post('/v1/processors', dpo.session, body));
}

export const PRIVACY_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/notices': async (s) => {
    const dpo = await officer(s);
    await consentFor(s);
    const body = { key: 'privacy_notice', title: 'Aviso', body: BODY, purposes: [] };
    return { test: s.post('/v1/notices', dpo.session, body) };
  },
  'PATCH /v1/notices/{id}': async (s) => {
    const dpo = await officer(s);
    const id = await draft(s, dpo, 'privacy_policy', []);
    const body = { title: 'Política editada', body: BODY, purposes: [] };
    return { test: s.patch(`/v1/notices/${id}`, dpo.session, body, 1) };
  },
  'POST /v1/notices/{id}/actions/publish': async (s) => {
    const dpo = await officer(s);
    const id = await draft(s, dpo, 'authorization_candidate', ['RECRUITMENT']);
    return {
      test: withVersion(s.post(`/v1/notices/${id}/actions/publish`, dpo.session), 1),
    };
  },
  'POST /v1/parties/{id}/consents': async (s) => {
    const { sales, id } = await person(s);
    return { test: s.post(`/v1/parties/${id}/consents`, sales.session, await consentFor(s)) };
  },
  'POST /v1/consents/{id}/actions/revoke': async (s) => {
    const { id } = await person(s);
    const dpo = await officer(s);
    const list = await s.get(`/v1/consents?party_id=${id}`, dpo.session);
    const consentId = consentListResponseSchema.parse(list.body).data[0]?.id ?? '';
    const body = { reason: 'Recorrido de auditoría' };
    return { test: s.post(`/v1/consents/${consentId}/actions/revoke`, dpo.session, body) };
  },
  'POST /v1/processing-activities': async (s) => {
    const dpo = await officer(s);
    return { test: s.post('/v1/processing-activities', dpo.session, ACTIVITY) };
  },
  'PATCH /v1/processing-activities/{id}': async (s) => {
    const dpo = await officer(s);
    const id = await created(s.post('/v1/processing-activities', dpo.session, ACTIVITY));
    const body = { ...ACTIVITY, retention: 'Dos años', status: 'active' };
    return { test: s.patch(`/v1/processing-activities/${id}`, dpo.session, body, 1) };
  },
  'POST /v1/processors': async (s) => {
    const dpo = await officer(s);
    const sales = await s.person('comercial-recorrido', ['COMERCIAL']);
    const party = await created(s.post('/v1/parties', sales.session, organizationBody()));
    const body = { party_id: party, service: 'Nube', country: 'US', review_on: '2027-01-31' };
    return { test: s.post('/v1/processors', dpo.session, body) };
  },
  'PATCH /v1/processors/{id}': async (s) => {
    const dpo = await officer(s);
    const id = await processor(s, dpo);
    const body = {
      service: 'Nube y correo',
      country: 'US',
      review_on: '2027-01-31',
      status: 'active',
    };
    return { test: s.patch(`/v1/processors/${id}`, dpo.session, body, 1) };
  },
};
