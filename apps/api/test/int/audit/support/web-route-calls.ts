import { siteCreatedResponseSchema, formReceiptSchema, type LegalTextKey } from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { seedCore } from '../../../../src/modules/core/index.js';
import { seedCrmWorkflows } from '../../../../src/modules/crm/index.js';
import { unsubscribeTokenHash } from '../../../../src/modules/web/application/submissions.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { contactNoticeId } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Rutas del sitio público, sus textos legales y formularios (B41) que escriben, para el recorrido
// de auditoría. Van al final: aceptar los términos de la plataforma exige publicarlos, y desde ese
// momento todo ingreso nuevo de esa empresa espera la aceptación. Por eso se publican en la otra
// empresa del escenario, que el resto del recorrido no usa para ingresar.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const BODY = 'Texto del recorrido de auditoría.\n\n## Alcance\n\n- Solo de prueba.';
const TOKEN = 'llave-de-baja-del-recorrido-de-auditoria-0001';

function final(test: request.Test): PendingRequest {
  return { test };
}

function publicCall(path: string, s: AccessScenario, body: object): request.Test {
  return request(s.app.getHttpServer())
    .post(`/v1/public/${path}`)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .send(body);
}

function versioned(s: AccessScenario, path: string, person: Person, version: number) {
  return s.post(path, person.session, {}).set('If-Match', `"${String(version)}"`);
}

async function officer(s: AccessScenario, tenantId = s.tenant.id): Promise<Person> {
  return s.person(`oficial-${uuidv7().slice(-6)}`, ['OFICIAL_DATOS'], { tenantId });
}

async function director(s: AccessScenario, tenantId = s.tenant.id): Promise<Person> {
  return s.person(`direccion-${uuidv7().slice(-6)}`, ['DIRECCION'], { tenantId });
}

async function draft(s: AccessScenario, person: Person, key: LegalTextKey): Promise<string> {
  const response = await s.post('/v1/site/legal-texts', person.session, {
    key,
    title: 'Texto del recorrido',
    body: BODY,
  });
  if (response.status !== 201) throw new Error(response.text);
  return siteCreatedResponseSchema.parse(response.body).id;
}

/** Borrador redactado por el Oficial y aprobado por la Dirección. */
async function approved(s: AccessScenario, key: LegalTextKey, tenantId = s.tenant.id) {
  const writer = await officer(s, tenantId);
  const boss = await director(s, tenantId);
  const id = await draft(s, writer, key);
  const response = await versioned(s, `/v1/site/legal-texts/${id}/actions/approve`, boss, 1);
  if (response.status !== 204) throw new Error(response.text);
  return { id, boss };
}

async function publishedVersion(s: AccessScenario, key: LegalTextKey, tenantId = s.tenant.id) {
  const { id, boss } = await approved(s, key, tenantId);
  const response = await versioned(s, `/v1/site/legal-texts/${id}/actions/publish`, boss, 2);
  if (response.status !== 204) throw new Error(response.text);
  return id;
}

async function page(s: AccessScenario): Promise<{ id: string; person: Person }> {
  const person = await s.person(`comercial-${uuidv7().slice(-6)}`, ['COMERCIAL']);
  const response = await s.post('/v1/site/pages', person.session, pageBody());
  if (response.status !== 201) throw new Error(response.text);
  return { id: siteCreatedResponseSchema.parse(response.body).id, person };
}

function pageBody() {
  return {
    slug: `recorrido-${uuidv7().slice(-8)}`,
    title: 'Página del recorrido',
    summary: null,
    body: BODY,
  };
}

/** Catálogos, flujo de prospectos y aviso de contactos publicado en la empresa del sitio. */
async function formReady(s: AccessScenario): Promise<string> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  await seedCrmWorkflows(apiDatabase(), [s.tenant.id], systemClock);
  return contactNoticeId(s);
}

async function visitor(s: AccessScenario) {
  return {
    first_name: 'Visitante',
    last_name: 'Del Recorrido',
    email: `visitante.${uuidv7().slice(-8)}@ejemplo.test`,
    phone: null,
    company: null,
    notice_id: await formReady(s),
    accept_privacy: true,
  };
}

/** Un contacto recibido cuyo enlace de baja tiene una llave conocida. */
async function submissionWithLink(s: AccessScenario): Promise<void> {
  const body = { ...(await visitor(s)), message: 'Mensaje del recorrido de auditoría.' };
  const response = await publicCall('forms/contact', s, body);
  if (response.status !== 201) throw new Error(response.text);
  const { code } = formReceiptSchema.parse(response.body);
  await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) =>
    tx.webFormSubmission.update({
      where: { tenantId_code: { tenantId: s.tenant.id, code } },
      data: { unsubscribeTokenHash: unsubscribeTokenHash(TOKEN) },
    }),
  );
}

export const WEB_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/site/pages': async (s) => {
    const person = await s.person('comercial-pagina', ['COMERCIAL']);
    return final(s.post('/v1/site/pages', person.session, pageBody()));
  },
  'PATCH /v1/site/pages/{id}': async (s) => {
    const { id, person } = await page(s);
    return final(s.patch(`/v1/site/pages/${id}`, person.session, pageBody(), 1));
  },
  'POST /v1/site/pages/{id}/actions': async (s) => {
    const { id, person } = await page(s);
    const path = `/v1/site/pages/${id}/actions`;
    return final(s.post(path, person.session, { action: 'publish' }).set('If-Match', '"1"'));
  },
  'POST /v1/site/legal-texts': async (s) => {
    const writer = await officer(s);
    const body = { key: 'site_terms', title: 'Términos del recorrido', body: BODY };
    return final(s.post('/v1/site/legal-texts', writer.session, body));
  },
  'PATCH /v1/site/legal-texts/{id}': async (s) => {
    const writer = await officer(s);
    const id = await draft(s, writer, 'data_subject_rights');
    const body = { title: 'Derechos corregidos', body: BODY };
    return final(s.patch(`/v1/site/legal-texts/${id}`, writer.session, body, 1));
  },
  'POST /v1/site/legal-texts/{id}/actions/approve': async (s) => {
    const writer = await officer(s);
    const boss = await director(s);
    const id = await draft(s, writer, 'security_disclosure');
    return final(versioned(s, `/v1/site/legal-texts/${id}/actions/approve`, boss, 1));
  },
  'POST /v1/site/legal-texts/{id}/actions/publish': async (s) => {
    const { id, boss } = await approved(s, 'third_party_notices');
    return final(versioned(s, `/v1/site/legal-texts/${id}/actions/publish`, boss, 2));
  },
  'POST /v1/public/forms/contact': async (s) => {
    const body = { ...(await visitor(s)), message: 'Quiero saber más de sus servicios.' };
    return final(publicCall('forms/contact', s, body));
  },
  'POST /v1/public/forms/quote': async (s) => {
    const body = {
      ...(await visitor(s)),
      service: 'saas',
      timeframe: 'later',
      description: 'Un producto por suscripción para nuestros clientes.',
    };
    return final(publicCall('forms/quote', s, body));
  },
  'POST /v1/public/cookie-consent': async (s) => {
    await publishedVersion(s, 'cookie_policy');
    const body = { visitor_id: uuidv7(), policy_version: 1, choice: { preferences: true } };
    return final(publicCall('cookie-consent', s, body));
  },
  'POST /v1/public/unsubscribe': async (s) => {
    await submissionWithLink(s);
    return final(publicCall('unsubscribe', s, { token: TOKEN }));
  },
  'POST /v1/me/platform-terms/accept': async (s) => {
    const tenantId = s.otherTenant.id;
    const textId = await publishedVersion(s, 'platform_terms', tenantId);
    const person = await s.person('acepta-terminos', ['COLABORADOR'], { tenantId });
    return final(s.post('/v1/me/platform-terms/accept', person.session, { text_id: textId }));
  },
};
