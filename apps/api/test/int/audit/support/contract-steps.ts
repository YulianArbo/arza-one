import {
  contractDetailSchema,
  contractOptionsSchema,
  createdResponseSchema,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { renderPendingContracts, seedContracts } from '../../../../src/modules/contract/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { consentFor, organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Pasos de preparación del recorrido de escrituras (B11) para Contratos (B24): las personas, un
// contrato en cada estado, un otrosí y una obligación, preparados por la API y con una pasada del
// worker cuando hace falta el PDF.

export interface PendingRequest {
  readonly test: request.Test;
}

export interface People {
  readonly sales: Person;
  readonly director: Person;
}

export async function people(s: AccessScenario): Promise<People> {
  await consentFor(s);
  await seedContracts(apiDatabase(), [s.tenant.id], systemClock);
  return {
    sales: await s.person('comercial-contratos-recorrido', ['COMERCIAL']),
    director: await s.person('direccion-contratos-recorrido', ['DIRECCION']),
  };
}

export function day(s: AccessScenario, offset: number): string {
  const bogota = new Date(s.clock.now().getTime() - 5 * 3_600_000 + offset * 86_400_000);
  return bogota.toISOString().slice(0, 10);
}

export async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

export function versioned(test: request.Test, version: number): request.Test {
  return test.set('If-Match', `"${String(version)}"`);
}

export function put(s: AccessScenario, path: string, person: Person, body: object): request.Test {
  return request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token)
    .send(body);
}

export function data(s: AccessScenario): Record<string, string | null> {
  return {
    title: 'Portal',
    object: 'desarrollar el portal de clientes',
    value: '1000000.00',
    payment_terms: 'Contado',
    starts_on: day(s, 0),
    ends_on: day(s, 365),
    renewal: 'none',
    responsible_id: null,
    client_signer_name: 'Laura Gómez',
    client_signer_document: 'CC 43000000',
  };
}

export async function draft(s: AccessScenario, person: Person): Promise<string> {
  const options = contractOptionsSchema.parse(
    (await s.get('/v1/contracts/options', person.session)).body,
  );
  const party = await created(s.post('/v1/parties', person.session, organizationBody()));
  const body = {
    template_id: options.templates[0]?.id,
    party_id: party,
    quote_id: null,
    ...data(s),
  };
  return created(s.post('/v1/contracts', person.session, body));
}

async function versionOf(s: AccessScenario, person: Person, id: string): Promise<number> {
  return contractDetailSchema.parse((await s.get(`/v1/contracts/${id}`, person.session)).body)
    .version;
}

/** El paso con la versión vigente, sin enviar: va dentro de un objeto (ver write-route-calls). */
export async function step(
  s: AccessScenario,
  person: Person,
  id: string,
  action: string,
  body = {},
): Promise<PendingRequest> {
  const path = `/v1/contracts/${id}/actions/${action}`;
  // La versión se pide antes de preparar el paso: dos peticiones abiertas cierran el servidor.
  const version = await versionOf(s, person, id);
  return { test: versioned(s.post(path, person.session, body), version) };
}

async function render(): Promise<void> {
  await renderPendingContracts({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: async () => Promise.resolve(samplePdf('Contrato')),
  });
}

export async function signedCopy(s: AccessScenario, person: Person): Promise<string> {
  const file = await s.db.withTenant({ tenantId: s.tenant.id, userId: person.id }, (tx) =>
    tx.file.create({
      data: {
        tenantId: s.tenant.id,
        storageKey: `${s.tenant.id}/${crypto.randomUUID()}`,
        fileName: 'firmado.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        scanStatus: 'available',
        sha256: '0'.repeat(64),
        scannedAt: new Date(),
      },
    }),
  );
  return file.id;
}

export async function inReview(s: AccessScenario): Promise<People & { id: string }> {
  const crew = await people(s);
  const id = await draft(s, crew.sales);
  expect((await (await step(s, crew.sales, id, 'submit')).test).status).toBe(204);
  return { ...crew, id };
}

export async function approved(s: AccessScenario): Promise<People & { id: string }> {
  const crew = await inReview(s);
  expect((await (await step(s, crew.director, crew.id, 'approve')).test).status).toBe(204);
  await render();
  return crew;
}

export async function active(s: AccessScenario): Promise<People & { id: string }> {
  const crew = await approved(s);
  const body = { file_id: await signedCopy(s, crew.sales), signed_on: day(s, 0) };
  expect((await (await step(s, crew.sales, crew.id, 'register-signature', body)).test).status).toBe(
    204,
  );
  return crew;
}

/** Contrato vigente con un otrosí en revisión: su ruta base. */
export interface WithAmendment extends People {
  readonly id: string;
  readonly base: string;
}

export async function amendment(s: AccessScenario): Promise<WithAmendment> {
  const crew = await active(s);
  const amendmentId = await created(
    s.post(`/v1/contracts/${crew.id}/amendments`, crew.sales.session, {
      summary: 'Se amplía el alcance',
      body: 'Las partes acuerdan ampliar el alcance del contrato.',
      effective_on: day(s, 0),
      new_ends_on: null,
      new_value: null,
    }),
  );
  return { ...crew, base: `/v1/contracts/${crew.id}/amendments/${amendmentId}` };
}

/** La versión vigente del otrosí, como la ve la ficha del contrato. */
export async function amendmentVersion(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<number> {
  const detail = contractDetailSchema.parse(
    (await s.get(`/v1/contracts/${id}`, person.session)).body,
  );
  return detail.amendments[0]?.version ?? 0;
}

export async function approvedAmendment(s: AccessScenario): Promise<WithAmendment> {
  const crew = await amendment(s);
  const version = await amendmentVersion(s, crew.sales, crew.id);
  const approve = versioned(
    s.post(`${crew.base}/actions/approve`, crew.director.session, {}),
    version,
  );
  expect((await approve).status).toBe(204);
  await render();
  return crew;
}

export async function obligation(
  s: AccessScenario,
): Promise<People & { body: Record<string, string>; path: string }> {
  const crew = await people(s);
  const id = await draft(s, crew.sales);
  const body = {
    description: 'Entregar el prototipo',
    responsible_id: crew.sales.id,
    due_on: day(s, 10),
  };
  const obligationId = await created(
    s.post(`/v1/contracts/${id}/obligations`, crew.sales.session, body),
  );
  return { ...crew, body, path: `/v1/contracts/${id}/obligations/${obligationId}` };
}
