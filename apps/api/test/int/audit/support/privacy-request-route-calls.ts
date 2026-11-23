import { createdResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { consentFor, personBody } from '../../party/support/party-scenario.js';
import { siteCompany } from './care-route-calls.js';
import { clientCrew } from './portal-steps.js';

// Llamadas del recorrido de escrituras (B11) para las solicitudes de titulares, la entrega y la
// supresión de datos y los incidentes (B42). Lo que cada llamada necesita se prepara por la API.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const REQUESTS = '/v1/privacy-requests';
const INCIDENTS = '/v1/privacy-incidents';

function officer(s: AccessScenario): Promise<Person> {
  return s.person('oficial-solicitudes', ['OFICIAL_DATOS']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

function act(s: AccessScenario, path: string, dpo: Person, version: number, body: object = {}) {
  return s.post(path, dpo.session, body).set('If-Match', `"${String(version)}"`);
}

function today(s: AccessScenario): string {
  return s.clock.now().toISOString().slice(0, 10);
}

function requestBody(s: AccessScenario, right = 'know') {
  return {
    channel: 'email',
    right,
    requester_name: 'Titular del Recorrido',
    requester_email: 'titular.recorrido@ejemplo.test',
    requester_phone: null,
    document_number: '1000000042',
    description: 'Quiero conocer los datos que tienen de mí.',
    received_on: today(s),
  };
}

async function newRequest(s: AccessScenario, dpo: Person, right = 'know'): Promise<string> {
  return created(s.post(REQUESTS, dpo.session, requestBody(s, right)));
}

/** Solicitud en trámite, relacionada con una persona registrada en Terceros. */
async function verified(s: AccessScenario, right = 'know') {
  const dpo = await officer(s);
  const sales = await s.person('comercial-solicitudes', ['COMERCIAL']);
  const body = { ...personBody(), consent: await consentFor(s) };
  const partyId = await created(s.post('/v1/parties', sales.session, body));
  const id = await newRequest(s, dpo, right);
  const verify = { party_id: partyId, method: 'document', note: 'Copia de la cédula revisada.' };
  const response = await act(s, `${REQUESTS}/${id}/actions/verify`, dpo, 1, verify);
  expect(response.status, response.text).toBe(204);
  return { dpo, id, partyId };
}

async function responded(s: AccessScenario) {
  const { dpo, id } = await verified(s);
  const answer = { response: 'Estos son los datos que tenemos de usted en la plataforma.' };
  const response = await act(s, `${REQUESTS}/${id}/actions/respond`, dpo, 2, answer);
  expect(response.status, response.text).toBe(204);
  return { dpo, id };
}

function incidentBody(s: AccessScenario) {
  return {
    title: 'Correo enviado a un destinatario equivocado',
    description: 'Se envió un archivo con datos de contacto a una persona externa por error.',
    detected_at: s.clock.now().toISOString(),
    affected_count: 3,
    data_categories: ['contact'],
  };
}

async function incident(s: AccessScenario) {
  const dpo = await officer(s);
  return { dpo, id: await created(s.post(INCIDENTS, dpo.session, incidentBody(s))) };
}

function publicCall(s: AccessScenario, path: string, body: object): request.Test {
  return request(s.app.getHttpServer())
    .post(`/v1/public/privacy-requests${path}`)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send(body);
}

const PUBLIC_BODY = {
  right: 'know',
  name: 'Titular Público',
  document_number: '1000000043',
  email: 'titular.publico@ejemplo.test',
  phone: null,
  description: 'Quiero conocer los datos que tienen de mí.',
  accepts_privacy: true,
};

export const PRIVACY_REQUEST_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/privacy-requests': async (s) => {
    const dpo = await officer(s);
    return { test: s.post(REQUESTS, dpo.session, requestBody(s)) };
  },
  'POST /v1/privacy-requests/export': async (s) => {
    const dpo = await officer(s);
    return { test: s.post(`${REQUESTS}/export`, dpo.session, {}) };
  },
  'POST /v1/privacy-requests/{id}/actions/start-verification': async (s) => {
    const dpo = await officer(s);
    const id = await newRequest(s, dpo);
    return { test: act(s, `${REQUESTS}/${id}/actions/start-verification`, dpo, 1) };
  },
  'POST /v1/privacy-requests/{id}/actions/verify': async (s) => {
    const { dpo, partyId } = await verified(s);
    const id = await newRequest(s, dpo);
    const body = { party_id: partyId, method: 'email_match', note: 'El correo coincide.' };
    return { test: act(s, `${REQUESTS}/${id}/actions/verify`, dpo, 1, body) };
  },
  'POST /v1/privacy-requests/{id}/actions/require': async (s) => {
    const dpo = await officer(s);
    const id = await newRequest(s, dpo, 'rectify');
    const body = { text: 'Indique qué dato quiere corregir.' };
    return { test: act(s, `${REQUESTS}/${id}/actions/require`, dpo, 1, body) };
  },
  'POST /v1/privacy-requests/{id}/actions/answer-requirement': async (s) => {
    const dpo = await officer(s);
    const id = await newRequest(s, dpo, 'rectify');
    const asked = { text: 'Indique qué dato quiere corregir.' };
    expect((await act(s, `${REQUESTS}/${id}/actions/require`, dpo, 1, asked)).status).toBe(204);
    const body = { note: 'Envió el dato correcto.', answered_on: today(s) };
    return { test: act(s, `${REQUESTS}/${id}/actions/answer-requirement`, dpo, 2, body) };
  },
  'POST /v1/privacy-requests/{id}/actions/extend': async (s) => {
    const dpo = await officer(s);
    const id = await newRequest(s, dpo);
    const body = { reason: 'Debemos consultar varios módulos.' };
    return { test: act(s, `${REQUESTS}/${id}/actions/extend`, dpo, 1, body) };
  },
  'POST /v1/privacy-requests/{id}/actions/respond': async (s) => {
    const { dpo, id } = await verified(s);
    const body = { response: 'Estos son los datos que tenemos de usted en la plataforma.' };
    return { test: act(s, `${REQUESTS}/${id}/actions/respond`, dpo, 2, body) };
  },
  'POST /v1/privacy-requests/{id}/actions/close': async (s) => {
    const { dpo, id } = await responded(s);
    return { test: act(s, `${REQUESTS}/${id}/actions/close`, dpo, 3) };
  },
  'POST /v1/parties/{id}/personal-data/export': async (s) => {
    const { dpo, id, partyId } = await verified(s);
    const path = `/v1/parties/${partyId}/personal-data/export`;
    return { test: s.post(path, dpo.session, { request_id: id }) };
  },
  'POST /v1/parties/{id}/personal-data/erase': async (s) => {
    const { dpo, id, partyId } = await verified(s, 'erase');
    const path = `/v1/parties/${partyId}/personal-data/erase`;
    return { test: s.post(path, dpo.session, { request_id: id }) };
  },
  'POST /v1/public/privacy-requests': async (s) => {
    await siteCompany(s);
    return { test: publicCall(s, '', PUBLIC_BODY) };
  },
  'POST /v1/public/privacy-requests/status': async (s) => {
    await siteCompany(s);
    const response = await publicCall(s, '', PUBLIC_BODY);
    expect(response.status, response.text).toBe(201);
    const { code } = response.body as { code: string };
    return { test: publicCall(s, '/status', { code, email: PUBLIC_BODY.email }) };
  },
  'POST /v1/portal/me/privacy-requests': async (s) => {
    const crew = await clientCrew(s);
    const body = {
      right: 'know',
      document_number: '1000000044',
      description: 'Quiero conocer los datos que tienen de mí.',
    };
    return { test: s.post('/v1/portal/me/privacy-requests', crew.admin.session, body) };
  },
  'POST /v1/privacy-incidents': async (s) => {
    const dpo = await officer(s);
    return { test: s.post(INCIDENTS, dpo.session, incidentBody(s)) };
  },
  'POST /v1/privacy-incidents/export': async (s) => {
    const dpo = await officer(s);
    return { test: s.post(`${INCIDENTS}/export`, dpo.session, {}) };
  },
  'PATCH /v1/privacy-incidents/{id}': async (s) => {
    const { dpo, id } = await incident(s);
    return { test: s.patch(`${INCIDENTS}/${id}`, dpo.session, incidentBody(s), 1) };
  },
  'POST /v1/privacy-incidents/{id}/actions/contain': async (s) => {
    const { dpo, id } = await incident(s);
    const body = { note: 'Se pidió borrar el correo.' };
    return { test: act(s, `${INCIDENTS}/${id}/actions/contain`, dpo, 1, body) };
  },
  'POST /v1/privacy-incidents/{id}/actions/report': async (s) => {
    const { dpo, id } = await incident(s);
    const body = { reported_on: today(s), reference: 'SIC-2026-000123' };
    return { test: act(s, `${INCIDENTS}/${id}/actions/report`, dpo, 1, body) };
  },
  'POST /v1/privacy-incidents/{id}/actions/notify-holders': async (s) => {
    const { dpo, id } = await incident(s);
    const body = { notified_on: today(s), note: 'Se les escribió por correo a los tres.' };
    return { test: act(s, `${INCIDENTS}/${id}/actions/notify-holders`, dpo, 1, body) };
  },
  'POST /v1/privacy-incidents/{id}/measures': async (s) => {
    const { dpo, id } = await incident(s);
    const body = { description: 'Se cambió la lista de distribución.', taken_on: today(s) };
    return { test: act(s, `${INCIDENTS}/${id}/measures`, dpo, 1, body) };
  },
  'POST /v1/privacy-incidents/{id}/actions/close': async (s) => {
    const { dpo, id } = await incident(s);
    const body = { not_reportable_reason: 'Los datos no salieron de la empresa: no hubo riesgo.' };
    return { test: act(s, `${INCIDENTS}/${id}/actions/close`, dpo, 1, body) };
  },
};
