import { createdResponseSchema, quoteDetailSchema } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { processPendingQuotes, seedCrmWorkflows } from '../../../../src/modules/crm/index.js';
import { seedTaxParameters } from '../../../../src/modules/fin/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { tokenOf } from '../../crm/support/quote-scenario.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { consentFor, organizationBody, uniqueNumber } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Llamadas del recorrido de escrituras (B11) para el portafolio, las cotizaciones, el enlace del
// cliente y los parámetros tributarios (B23). Lo que cada llamada necesita se prepara por la API,
// con una persona de Comercial, y con una pasada del worker cuando hace falta el PDF o el correo.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

async function sales(s: AccessScenario): Promise<Person> {
  await consentFor(s);
  await seedCrmWorkflows(apiDatabase(), [s.tenant.id], systemClock);
  await seedTaxParameters(apiDatabase(), [s.tenant.id], systemClock);
  return s.person('comercial-cotizaciones-recorrido', ['COMERCIAL']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

function put(s: AccessScenario, path: string, person: Person, body: object): request.Test {
  return request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token)
    .set('If-Match', '"1"')
    .send(body);
}

function draft(discount = '0') {
  return {
    valid_until: '2099-12-31',
    conditions: { payment_terms: 'Contado', delivery_terms: 'Un mes', warranty: null },
    notes: null,
    items: [
      {
        service_id: null,
        description: 'Desarrollo',
        unit: 'hour',
        quantity: '1',
        unit_price: '1000',
        discount_percent: discount,
        tax_key: 'IVA_GENERAL',
      },
    ],
  };
}

async function quote(s: AccessScenario, person: Person, discount = '0'): Promise<string> {
  const party = await created(s.post('/v1/parties', person.session, organizationBody()));
  const opportunity = await created(
    s.post('/v1/crm/opportunities', person.session, {
      party_id: party,
      title: 'Portal',
      estimated_value: '1000.00',
      expected_close: '2026-12-01',
    }),
  );
  return created(
    s.post('/v1/crm/quotes', person.session, { opportunity_id: opportunity, ...draft(discount) }),
  );
}

async function versionOf(s: AccessScenario, person: Person, id: string): Promise<number> {
  const response = await s.get(`/v1/crm/quotes/${id}`, person.session);
  return quoteDetailSchema.parse(response.body).version;
}

/** El paso con la versión vigente, sin enviar: va dentro de un objeto (ver write-route-calls). */
async function step(
  s: AccessScenario,
  person: Person,
  id: string,
  action: string,
  body = {},
): Promise<PendingRequest> {
  const version = await versionOf(s, person, id);
  const test = s
    .post(`/v1/crm/quotes/${id}/actions/${action}`, person.session, body)
    .set('If-Match', `"${String(version)}"`);
  return { test };
}

const sentMails: { text: string }[] = [];

async function work(): Promise<void> {
  await processPendingQuotes({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: async () => Promise.resolve(samplePdf('Propuesta')),
    mailer: {
      send: async (mail) => {
        sentMails.push(mail);
        return Promise.resolve();
      },
    },
    appUrl: 'https://app.arza.test',
  });
}

async function approved(s: AccessScenario, person: Person): Promise<string> {
  const id = await quote(s, person);
  expect((await (await step(s, person, id, 'submit')).test).status).toBe(204);
  await work();
  return id;
}

const RECIPIENT = { recipient_name: 'Clara Cliente', recipient_email: 'clara@example.com' };

/** Cotización enviada y la llave del enlace que recibió el cliente. */
async function sentToken(s: AccessScenario): Promise<string> {
  const person = await sales(s);
  const id = await approved(s, person);
  expect((await (await step(s, person, id, 'send', RECIPIENT)).test).status).toBe(204);
  await work();
  const mail = sentMails.at(-1);
  if (mail === undefined) throw new Error('El worker no envió el correo');
  return tokenOf({ to: '', subject: '', text: mail.text });
}

async function inApproval(s: AccessScenario): Promise<{ id: string; director: Person }> {
  const person = await sales(s);
  const id = await quote(s, person, '50');
  expect((await (await step(s, person, id, 'submit')).test).status).toBe(204);
  return { id, director: await s.person('direccion-recorrido', ['DIRECCION']) };
}

function publicCall(s: AccessScenario, path: string, body: object): request.Test {
  return request(s.app.getHttpServer())
    .post(`/v1/public/quotes/${path}`)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send(body);
}

const SERVICE = { unit: 'hour', base_price: '1000', tax_key: 'IVA_GENERAL' };

export const QUOTE_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/crm/services': async (s) => {
    const person = await sales(s);
    const body = { ...SERVICE, name: `Servicio ${uniqueNumber()}` };
    return { test: s.post('/v1/crm/services', person.session, body) };
  },
  'PUT /v1/crm/services/{id}': async (s) => {
    const person = await sales(s);
    const body = { ...SERVICE, name: `Servicio ${uniqueNumber()}` };
    const id = await created(s.post('/v1/crm/services', person.session, body));
    return { test: put(s, `/v1/crm/services/${id}`, person, { ...body, is_active: false }) };
  },
  'POST /v1/crm/quotes': async (s) => {
    const person = await sales(s);
    const party = await created(s.post('/v1/parties', person.session, organizationBody()));
    const opportunity = await created(
      s.post('/v1/crm/opportunities', person.session, {
        party_id: party,
        title: 'Portal',
        estimated_value: '1.00',
        expected_close: '2026-12-01',
      }),
    );
    const body = { opportunity_id: opportunity, ...draft() };
    return { test: s.post('/v1/crm/quotes', person.session, body) };
  },
  'PUT /v1/crm/quotes/{id}': async (s) => {
    const person = await sales(s);
    const id = await quote(s, person);
    return { test: put(s, `/v1/crm/quotes/${id}`, person, draft('5')) };
  },
  'POST /v1/crm/quotes/{id}/actions/submit': async (s) => {
    const person = await sales(s);
    const id = await quote(s, person);
    return step(s, person, id, 'submit');
  },
  'POST /v1/crm/quotes/{id}/actions/approve': async (s) => {
    const { id, director } = await inApproval(s);
    return step(s, director, id, 'approve', {});
  },
  'POST /v1/crm/quotes/{id}/actions/return': async (s) => {
    const { id, director } = await inApproval(s);
    return step(s, director, id, 'return', { comment: 'Baje el descuento.' });
  },
  'POST /v1/crm/quotes/{id}/actions/send': async (s) => {
    const person = await sales(s);
    const id = await approved(s, person);
    return step(s, person, id, 'send', RECIPIENT);
  },
  'POST /v1/crm/quotes/{id}/actions/new-version': async (s) => {
    const person = await sales(s);
    const id = await approved(s, person);
    return step(s, person, id, 'new-version');
  },
  'POST /v1/crm/quotes/{id}/pdf': async (s) => {
    const person = await sales(s);
    const id = await approved(s, person);
    return { test: s.post(`/v1/crm/quotes/${id}/pdf`, person.session) };
  },
  'POST /v1/public/quotes/view': async (s) => ({
    test: publicCall(s, 'view', { token: await sentToken(s) }),
  }),
  'POST /v1/public/quotes/pdf': async (s) => ({
    test: publicCall(s, 'pdf', { token: await sentToken(s) }),
  }),
  'POST /v1/public/quotes/accept': async (s) => ({
    test: publicCall(s, 'accept', {
      token: await sentToken(s),
      accepted_by_name: 'Clara Cliente',
      accept: true,
    }),
  }),
  'POST /v1/public/quotes/reject': async (s) => ({
    test: publicCall(s, 'reject', { token: await sentToken(s), reason: null }),
  }),
  'POST /v1/finance/tax-parameters/versions': async (s) => {
    await seedTaxParameters(apiDatabase(), [s.tenant.id], systemClock);
    const person = await s.person('contador-recorrido', ['CONTADOR']);
    const body = {
      key: `IVA_RECORRIDO_${uniqueNumber()}`,
      label: 'IVA de recorrido',
      rate: '19',
      valid_from: '2099-01-01',
      legal_basis: 'Estatuto Tributario, art. 468.',
    };
    return { test: s.post('/v1/finance/tax-parameters/versions', person.session, body) };
  },
};
