import { contractOptionsSchema, envelopeListResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  processSignatureWork,
  renderPendingContracts,
} from '../../../../src/modules/contract/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { consentFor, organizationBody, personBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import { created, data, day, people, step, type PendingRequest } from './contract-steps.js';

// Llamadas del recorrido de escrituras (B11) para la firma electrónica (B25): preparar, enviar,
// anular, reenviar, firmar y rechazar por la empresa, descargar, la página de firma sin sesión y la
// verificación pública. Cada una prepara un contrato aprobado de un cliente listo para firmar.

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

interface Mail {
  readonly to: string;
  readonly text: string;
}

const mails: Mail[] = [];

async function work(): Promise<void> {
  await processSignatureWork({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: async () => Promise.resolve(samplePdf('Firmas')),
    mergePdfs: async (pdfs) => Promise.resolve(Buffer.concat([...pdfs])),
    mailer: {
      send: async (mail) => {
        mails.push(mail);
        return Promise.resolve();
      },
    },
    appUrl: 'https://app.arza.test',
  });
}

function lastMail(email: string, pattern: RegExp): string {
  const found = mails
    .filter((mail) => mail.to === email)
    .map((mail) => pattern.exec(mail.text)?.[1])
    .filter((value): value is string => value !== undefined);
  const value = found.at(-1);
  if (value === undefined) throw new Error(`No llegó el correo a ${email}`);
  return value;
}

function publicCall(s: AccessScenario, path: string, body: object): request.Test {
  return request(s.app.getHttpServer())
    .post(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send(body);
}

interface Ready {
  readonly sales: Person;
  readonly director: Person;
  readonly contractId: string;
  readonly signerId: string;
  readonly email: string;
}

/** Cliente con su firmante autorizado y su conocimiento aprobado; la Dirección, con su persona. */
async function signingParty(s: AccessScenario, sales: Person, director: Person) {
  const email = `firma-${crypto.randomUUID().slice(0, 8)}@cliente.test`;
  const consent = await consentFor(s);
  const signerId = await created(
    s.post('/v1/parties', sales.session, { ...personBody({ email }), consent }),
  );
  const partyId = await created(s.post('/v1/parties', sales.session, organizationBody()));
  const contact = { person_id: signerId, can_sign: true };
  expect((await s.post(`/v1/parties/${partyId}/contacts`, sales.session, contact)).status).toBe(
    201,
  );
  const review = { risk_level: 'low', summary: 'Revisión de RUT, cámara de comercio y listas.' };
  const reviewId = await created(
    s.post(`/v1/parties/${partyId}/due-diligence`, sales.session, review),
  );
  const approve = `/v1/parties/${partyId}/due-diligence/${reviewId}/actions/approve`;
  expect((await s.post(approve, director.session, {})).status).toBe(204);
  const directorParty = await created(
    s.post('/v1/parties', sales.session, { ...personBody(), consent }),
  );
  await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) => tx.user.update({ where: { id: director.id }, data: { partyId: directorParty } }));
  return { partyId, signerId, email };
}

async function ready(s: AccessScenario): Promise<Ready> {
  const { sales, director } = await people(s);
  const { partyId, signerId, email } = await signingParty(s, sales, director);
  const options = contractOptionsSchema.parse(
    (await s.get('/v1/contracts/options', sales.session)).body,
  );
  const body = { template_id: options.templates[0]?.id, party_id: partyId, quote_id: null };
  const contractId = await created(s.post('/v1/contracts', sales.session, { ...body, ...data(s) }));
  expect((await (await step(s, sales, contractId, 'submit')).test).status).toBe(204);
  expect((await (await step(s, director, contractId, 'approve')).test).status).toBe(204);
  await renderPendingContracts({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: async () => Promise.resolve(samplePdf('Contrato')),
  });
  return { sales, director, contractId, signerId, email };
}

function envelopeBody(s: AccessScenario, crew: Ready): Record<string, unknown> {
  return {
    source: 'contract',
    source_id: crew.contractId,
    client_signer_ids: [crew.signerId],
    company_signer_id: crew.director.id,
    expires_on: day(s, 10),
    message: null,
  };
}

async function envelopeOf(s: AccessScenario, crew: Ready) {
  const path = `/v1/signature-envelopes?source=contract&source_id=${crew.contractId}`;
  const [envelope] = envelopeListResponseSchema.parse(
    (await s.get(path, crew.sales.session)).body,
  ).items;
  if (envelope === undefined) throw new Error('Falta el proceso de firma');
  return envelope;
}

async function preparedEnvelope(s: AccessScenario): Promise<Ready & { envelopeId: string }> {
  const crew = await ready(s);
  const envelopeId = await created(
    s.post('/v1/signature-envelopes', crew.sales.session, envelopeBody(s, crew)),
  );
  return { ...crew, envelopeId };
}

async function sentEnvelope(s: AccessScenario): Promise<Ready & { envelopeId: string }> {
  const crew = await preparedEnvelope(s);
  const { version } = await envelopeOf(s, crew);
  const send = s
    .post(`/v1/signature-envelopes/${crew.envelopeId}/actions/send`, crew.director.session, {})
    .set('If-Match', `"${String(version)}"`)
    .set('Idempotency-Key', crypto.randomUUID());
  expect((await send).status).toBe(204);
  await work();
  return crew;
}

/** El enlace del firmante, con el código validado. */
async function ticketed(s: AccessScenario) {
  const crew = await sentEnvelope(s);
  const token = lastMail(crew.email, /#token=([A-Za-z0-9_-]+)/u);
  expect((await publicCall(s, '/v1/public/signatures/code', { token })).status).toBe(204);
  await work();
  const code = lastMail(crew.email, /es: ([0-9]{6})/u);
  const verified = await publicCall(s, '/v1/public/signatures/verify-code', { token, code });
  return { ...crew, token, ticket: (verified.body as { ticket: string }).ticket };
}

/** Firmó el cliente: le toca a la empresa. */
async function companyTurn(s: AccessScenario) {
  const crew = await ticketed(s);
  const body = { token: crew.token, ticket: crew.ticket, accept: true };
  expect((await publicCall(s, '/v1/public/signatures/sign', body)).status).toBe(204);
  return { ...crew, director: await s.refresh(crew.director) };
}

const BASE = '/v1/signature-envelopes';

export const SIGNATURE_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/signature-envelopes': async (s) => {
    const crew = await ready(s);
    return { test: s.post(BASE, crew.sales.session, envelopeBody(s, crew)) };
  },
  'POST /v1/signature-envelopes/{id}/actions/send': async (s) => {
    const crew = await preparedEnvelope(s);
    const { version } = await envelopeOf(s, crew);
    return {
      test: s
        .post(`${BASE}/${crew.envelopeId}/actions/send`, crew.director.session, {})
        .set('If-Match', `"${String(version)}"`)
        .set('Idempotency-Key', crypto.randomUUID()),
    };
  },
  'POST /v1/signature-envelopes/{id}/actions/cancel': async (s) => {
    const crew = await preparedEnvelope(s);
    const path = `${BASE}/${crew.envelopeId}/actions/cancel`;
    return { test: s.post(path, crew.director.session, { reason: 'Cambió el alcance.' }) };
  },
  'POST /v1/signature-envelopes/{id}/signers/{signerId}/actions/resend': async (s) => {
    const crew = await sentEnvelope(s);
    const signer = (await envelopeOf(s, crew)).signers[0]?.id ?? '';
    const path = `${BASE}/${crew.envelopeId}/signers/${signer}/actions/resend`;
    return { test: s.post(path, crew.director.session, {}) };
  },
  'POST /v1/signature-envelopes/{id}/actions/sign': async (s) => {
    const crew = await companyTurn(s);
    const path = `${BASE}/${crew.envelopeId}/actions/sign`;
    return { test: s.post(path, crew.director.session, { accept: true }) };
  },
  'POST /v1/signature-envelopes/{id}/actions/reject': async (s) => {
    const crew = await companyTurn(s);
    const path = `${BASE}/${crew.envelopeId}/actions/reject`;
    return { test: s.post(path, crew.director.session, { reason: 'Falta un anexo.' }) };
  },
  'POST /v1/signature-envelopes/{id}/documents': async (s) => {
    const crew = await preparedEnvelope(s);
    const path = `${BASE}/${crew.envelopeId}/documents`;
    return { test: s.post(path, crew.sales.session, { document: 'original' }) };
  },
  'POST /v1/public/signatures/open': async (s) => {
    const crew = await sentEnvelope(s);
    const token = lastMail(crew.email, /#token=([A-Za-z0-9_-]+)/u);
    return { test: publicCall(s, '/v1/public/signatures/open', { token }) };
  },
  'POST /v1/public/signatures/code': async (s) => {
    const crew = await sentEnvelope(s);
    const token = lastMail(crew.email, /#token=([A-Za-z0-9_-]+)/u);
    return { test: publicCall(s, '/v1/public/signatures/code', { token }) };
  },
  'POST /v1/public/signatures/verify-code': async (s) => {
    const crew = await sentEnvelope(s);
    const token = lastMail(crew.email, /#token=([A-Za-z0-9_-]+)/u);
    expect((await publicCall(s, '/v1/public/signatures/code', { token })).status).toBe(204);
    await work();
    const code = lastMail(crew.email, /es: ([0-9]{6})/u);
    return { test: publicCall(s, '/v1/public/signatures/verify-code', { token, code }) };
  },
  'POST /v1/public/signatures/document': async (s) => {
    const { token, ticket } = await ticketed(s);
    const body = { token, ticket, document: 'original' };
    return { test: publicCall(s, '/v1/public/signatures/document', body) };
  },
  'POST /v1/public/signatures/sign': async (s) => {
    const { token, ticket } = await ticketed(s);
    const body = { token, ticket, accept: true };
    return { test: publicCall(s, '/v1/public/signatures/sign', body) };
  },
  'POST /v1/public/signatures/reject': async (s) => {
    const { token, ticket } = await ticketed(s);
    const body = { token, ticket, reason: 'No estoy de acuerdo con el valor.' };
    return { test: publicCall(s, '/v1/public/signatures/reject', body) };
  },
  'POST /v1/public/verifications': async (s) => {
    const crew = await companyTurn(s);
    const sign = s.post(`${BASE}/${crew.envelopeId}/actions/sign`, crew.director.session, {
      accept: true,
    });
    expect((await sign).status).toBe(204);
    await work();
    const code = (await envelopeOf(s, crew)).signed?.verification_code ?? '';
    return { test: publicCall(s, '/v1/public/verifications', { code }) };
  },
};
