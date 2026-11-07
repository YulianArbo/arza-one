import { portalTermsSchema } from '@arza/contracts';
import { expect } from 'vitest';

import { giveRole, type AccessScenario, type Person } from '../../iam/support/access-scenario.js';
import { createUser, signIn, tenantScope, uniqueEmail } from '../../iam/support/iam-fixtures.js';
import { created, signedCopy, versioned } from './contract-steps.js';
import { detail, running, type Crew } from './project-route-calls.js';

// Pasos comunes del recorrido de escrituras del portal del cliente (B30): los términos publicados,
// las personas del portal ligadas a su empresa cliente y un proyecto en ejecución con lo compartido.
// Datos ficticios.

const TERMS_BODY =
  'Texto de prueba de los términos del portal para el recorrido de auditoría. Datos ficticios.';

/** El borrador de la clase, si quedó uno de otro paso del recorrido, y si ya hay uno publicado. */
async function noticeState(s: AccessScenario, key: string) {
  const notices = await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) => tx.privacyNotice.findMany({ where: { key, deletedAt: null } }));
  return {
    draft: notices.find((notice) => notice.status === 'draft') ?? null,
    published: notices.some((notice) => notice.status === 'published'),
  };
}

/**
 * Deja publicados los términos del portal y la política de privacidad. Otro paso del recorrido
 * (Privacidad) puede haber dejado un borrador, y solo se admite uno por clase: se publica ese.
 */
export async function publishTerms(s: AccessScenario): Promise<void> {
  const officer = await s.person('oficial-portal-recorrido', ['OFICIAL_DATOS']);
  for (const key of ['portal_terms', 'privacy_policy']) {
    const state = await noticeState(s, key);
    if (state.draft === null && state.published) continue;
    const body = { key, title: `Versión de recorrido de ${key}`, body: TERMS_BODY, purposes: [] };
    const draft = state.draft ?? {
      id: await created(s.post('/v1/notices', officer.session, body)),
      version: 1,
    };
    const path = `/v1/notices/${draft.id}/actions/publish`;
    const done = await versioned(s.post(path, officer.session), draft.version);
    expect(done.status, done.text).toBe(200);
  }
}

export async function portalAccount(
  s: AccessScenario,
  partyId: string,
  role: 'CLIENTE_ADMIN' | 'CLIENTE_USUARIO',
  email = uniqueEmail('cliente-recorrido'),
): Promise<Person> {
  const admin = role === 'CLIENTE_ADMIN';
  const id = await createUser(s.db, {
    tenantId: s.tenant.id,
    email,
    kind: 'portal',
    requireSecondFactor: admin,
    withSecondFactor: admin,
  });
  await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) => tx.user.update({ where: { id }, data: { partyId } }));
  await giveRole(s.db, { tenantId: s.tenant.id, userId: id }, role, { from: s.clock.now() });
  return { id, email, session: await signIn(s.app, email) };
}

export async function termIds(s: AccessScenario, person: Person): Promise<string[]> {
  const response = await s.get('/v1/portal/terms', person.session);
  expect(response.status, response.text).toBe(200);
  const terms = portalTermsSchema.parse(response.body);
  return terms.documents.map((document) => document.id);
}

/** Persona del portal de la empresa que ya aceptó los términos. */
export async function ready(
  s: AccessScenario,
  partyId: string,
  role: 'CLIENTE_ADMIN' | 'CLIENTE_USUARIO' = 'CLIENTE_ADMIN',
  email?: string,
): Promise<Person> {
  await publishTerms(s);
  const person = await portalAccount(s, partyId, role, email);
  const accepted = await s.post('/v1/portal/terms/acceptance', person.session, {
    notice_ids: await termIds(s, person),
  });
  expect(accepted.status, accepted.text).toBe(204);
  return person;
}

export interface ClientCrew extends Crew {
  readonly partyId: string;
  readonly admin: Person;
}

export async function clientCrew(s: AccessScenario): Promise<ClientCrew> {
  const crew = await running(s);
  const partyId = (await detail(s, crew)).party.id;
  return { ...crew, partyId, admin: await ready(s, partyId) };
}

export async function sharedFile(s: AccessScenario, crew: Crew): Promise<string> {
  const body = { file_id: await signedCopy(s, crew.leader), title: 'Manual de usuario' };
  return created(s.post(`${crew.base}/shared-files`, crew.leader.session, body));
}
