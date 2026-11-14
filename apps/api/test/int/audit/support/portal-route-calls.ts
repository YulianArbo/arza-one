import {
  portalContractListSchema,
  portalMyDataSchema,
  portalSignatureListSchema,
  portalUserListSchema,
} from '@arza/contracts';
import { expect } from 'vitest';

import { renderPendingPdfs, seedDocForms } from '../../../../src/modules/doc/index.js';
import { followAcceptances } from '../../../../src/modules/project/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { uniqueEmail } from '../../iam/support/iam-fixtures.js';
import { consentFor, personBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import { created, put, signedCopy, versioned, type PendingRequest } from './contract-steps.js';
import {
  clientCrew,
  portalAccount,
  publishTerms,
  ready,
  sharedFile,
  termIds,
  type ClientCrew,
} from './portal-steps.js';
import { detail, remove, running, step, type RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para el portal del cliente (B30) y lo que el equipo
// comparte con él. Cada una prepara por la API un proyecto en ejecución de un cliente, publica los
// términos del portal y crea al administrador del cliente ligado a su empresa. Datos ficticios.

const TICKET = {
  subject: 'No abre el reporte',
  description: 'El reporte mensual queda en blanco.',
  category: 'support',
  priority: 'low',
  project_id: null,
};

/** Firmante autorizado del cliente con el correo de su administrador en el portal. */
async function signerFor(
  s: AccessScenario,
  partyId: string,
): Promise<{ id: string; email: string }> {
  const sales = await s.person('comercial-portal-recorrido', ['COMERCIAL']);
  const email = `firma-portal-${crypto.randomUUID().slice(0, 8)}@cliente.test`;
  const body = { ...personBody({ email }), consent: await consentFor(s) };
  const id = await created(s.post('/v1/parties', sales.session, body));
  const added = await s.post(`/v1/parties/${partyId}/contacts`, sales.session, {
    person_id: id,
    can_sign: true,
  });
  expect(added.status, added.text).toBe(201);
  return { id, email };
}

/** Un acta enviada a firma del administrador del cliente. */
async function actaInSignature(s: AccessScenario): Promise<{ admin: Person; envelopeId: string }> {
  await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
  const crew = await running(s);
  const partyId = (await detail(s, crew)).party.id;
  const signer = await signerFor(s, partyId);
  const deliverable = await created(
    s.post(`${crew.base}/deliverables`, crew.leader.session, {
      name: 'Portal de clientes',
      description: null,
      version_label: '1.0.0',
      milestone_id: null,
      evidence_url: null,
    }),
  );
  const body = { signer_id: signer.id, environment: 'test', pending_note: null, message: null };
  const sent = await step(s, crew, `/deliverables/${deliverable}/actions/deliver`, 1, body).test;
  expect(sent.status, sent.text).toBe(201);
  await renderPendingPdfs({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: () => Promise.resolve(samplePdf('Acta')),
    convertOffice: () => Promise.resolve(samplePdf('Acta')),
    stamp: (pdf) => Promise.resolve(pdf),
  });
  await followAcceptances({ database: apiDatabase(), clock: systemClock });
  const admin = await ready(s, partyId, 'CLIENTE_ADMIN', signer.email.toLowerCase());
  const list = portalSignatureListSchema.parse(
    (await s.get('/v1/portal/signatures', admin.session)).body,
  );
  return { admin, envelopeId: list.pending[0]?.id ?? '' };
}

async function companyUser(
  s: AccessScenario,
): Promise<ClientCrew & { user: Person; version: number }> {
  const crew = await clientCrew(s);
  const user = await ready(s, crew.partyId, 'CLIENTE_USUARIO');
  const list = portalUserListSchema.parse(
    (await s.get('/v1/portal/users', crew.admin.session)).body,
  );
  const version = list.data.find((row) => row.id === user.id)?.version ?? 0;
  return { ...crew, user, version };
}

export const PORTAL_ROUTE_CALLS: Record<string, RouteCall> = {
  'PUT /v1/projects/{id}/portal': async (s) => {
    const crew = await running(s);
    const { version } = await detail(s, crew);
    return {
      test: versioned(put(s, `${crew.base}/portal`, crew.leader, { visible: false }), version),
    };
  },
  'POST /v1/projects/{id}/shared-files': async (s) => {
    const crew = await running(s);
    const body = { file_id: await signedCopy(s, crew.leader), title: 'Manual de usuario' };
    return { test: s.post(`${crew.base}/shared-files`, crew.leader.session, body) };
  },
  'DELETE /v1/projects/{id}/shared-files/{sharedId}': async (s) => {
    const crew = await running(s);
    const id = await sharedFile(s, crew);
    return { test: remove(s, `${crew.base}/shared-files/${id}`, crew.leader) };
  },
  'POST /v1/portal/terms/acceptance': async (s): Promise<PendingRequest> => {
    const crew = await running(s);
    await publishTerms(s);
    const person = await portalAccount(s, (await detail(s, crew)).party.id, 'CLIENTE_USUARIO');
    const body = { notice_ids: await termIds(s, person) };
    return { test: s.post('/v1/portal/terms/acceptance', person.session, body) };
  },
  'POST /v1/portal/signatures/{id}/link': async (s) => {
    const { admin, envelopeId } = await actaInSignature(s);
    return { test: s.post(`/v1/portal/signatures/${envelopeId}/link`, admin.session, {}) };
  },
  'POST /v1/portal/contracts/{id}/link': async (s) => {
    const crew = await clientCrew(s);
    const list = portalContractListSchema.parse(
      (await s.get('/v1/portal/contracts', crew.admin.session)).body,
    );
    const id = list.data[0]?.id ?? '';
    return { test: s.post(`/v1/portal/contracts/${id}/link`, crew.admin.session, {}) };
  },
  'POST /v1/portal/documents/{kind}/{id}/link': async (s) => {
    const crew = await clientCrew(s);
    const id = await sharedFile(s, crew);
    return { test: s.post(`/v1/portal/documents/shared/${id}/link`, crew.admin.session, {}) };
  },
  'POST /v1/portal/tickets': async (s) => {
    const crew = await clientCrew(s);
    return { test: s.post('/v1/portal/tickets', crew.admin.session, TICKET) };
  },
  'POST /v1/portal/tickets/{id}/messages': async (s) => {
    const crew = await clientCrew(s);
    const id = await created(s.post('/v1/portal/tickets', crew.admin.session, TICKET));
    const body = { body: 'Lo intenté de nuevo y sigue igual.' };
    return { test: s.post(`/v1/portal/tickets/${id}/messages`, crew.admin.session, body) };
  },
  'POST /v1/portal/pqrsf': async (s) => {
    const crew = await clientCrew(s);
    const body = {
      type: 'suggestion',
      subject: 'Mejorar el reporte',
      description: 'Sería útil exportar el reporte a una hoja de cálculo.',
    };
    return { test: s.post('/v1/portal/pqrsf', crew.admin.session, body) };
  },
  'PUT /v1/portal/me': async (s) => {
    const crew = await clientCrew(s);
    const me = portalMyDataSchema.parse((await s.get('/v1/portal/me', crew.admin.session)).body);
    const body = { display_name: 'Cliente del recorrido' };
    return { test: versioned(put(s, '/v1/portal/me', crew.admin, body), me.version) };
  },
  'POST /v1/portal/me/export': async (s) => {
    const crew = await clientCrew(s);
    return { test: s.post('/v1/portal/me/export', crew.admin.session, {}) };
  },
  'POST /v1/portal/users': async (s) => {
    const crew = await clientCrew(s);
    const body = {
      email: uniqueEmail('invitado-portal'),
      display_name: 'Persona Invitada',
      role: 'CLIENTE_USUARIO',
    };
    return { test: s.post('/v1/portal/users', crew.admin.session, body) };
  },
  'PUT /v1/portal/users/{id}': async (s) => {
    const crew = await companyUser(s);
    const body = { role: 'CLIENTE_ADMIN', active: true };
    const path = `/v1/portal/users/${crew.user.id}`;
    return { test: versioned(put(s, path, crew.admin, body), crew.version) };
  },
  'PUT /v1/portal/users/{id}/projects': async (s) => {
    const crew = await companyUser(s);
    const body = { project_ids: [crew.id] };
    return { test: put(s, `/v1/portal/users/${crew.user.id}/projects`, crew.admin, body) };
  },
};
