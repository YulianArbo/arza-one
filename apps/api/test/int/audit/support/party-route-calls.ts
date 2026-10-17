import { createdResponseSchema } from '@arza/contracts';
import request from 'supertest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  consentFor,
  organizationBody,
  personBody,
  uniqueNumber,
} from '../../party/support/party-scenario.js';

// Llamadas del recorrido de escrituras (B11) para las rutas de terceros (B13). Lo que cada llamada
// necesita se prepara en la base o por la API; la llamada final es la que se revisa.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const ACCOUNT = { bank: 'BANCOLOMBIA', account_type: 'savings', account_number: '55556666777' };
const REVIEW = { risk_level: 'low', summary: 'Revisión del recorrido de auditoría.' };

/** Persona de finanzas: crea, edita, fusiona y maneja cuentas; sesión recién abierta. */
async function finance(s: AccessScenario): Promise<SignedIn> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  return (await s.person('finanzas-recorrido', ['ADMIN_FINANCIERO'])).session;
}

async function created(s: AccessScenario, path: string, session: SignedIn, body: object) {
  const response = await s.post(path, session, body);
  return createdResponseSchema.parse(response.body).id;
}

function withVersion(test: request.Test, version: number): request.Test {
  return test.set('If-Match', `"${String(version)}"`);
}

function del(s: AccessScenario, path: string, session: SignedIn, version?: number): request.Test {
  const call = request(s.app.getHttpServer())
    .delete(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token);
  return version === undefined ? call : withVersion(call, version);
}

/** Un tercero creado por la API y la sesión de quien lo creó. */
async function newParty(s: AccessScenario, body: object = organizationBody()) {
  const session = await finance(s);
  return { session, id: await created(s, '/v1/parties', session, body) };
}

/** Cuenta pendiente registrada por el sistema: cualquier persona de finanzas la puede revisar. */
async function pendingAccount(s: AccessScenario, partyId: string) {
  const account = await s.inTenant((tx) =>
    tx.bankAccount.create({
      data: {
        tenantId: s.tenant.id,
        partyId,
        bank: 'BANCOLOMBIA',
        accountType: 'savings',
        accountNumberEncrypted: 'v1.recorrido.sin.descifrar',
        accountLast4: '0000',
      },
    }),
  );
  return account.id;
}

async function pendingReview(s: AccessScenario, partyId: string) {
  const review = await s.inTenant((tx) =>
    tx.dueDiligence.create({
      data: { tenantId: s.tenant.id, partyId, riskLevel: 'low', summary: REVIEW.summary },
    }),
  );
  return review.id;
}

async function director(s: AccessScenario): Promise<SignedIn> {
  return (await s.person('director-recorrido', ['DIRECCION'])).session;
}

const PARTY_CALLS: Record<string, RouteCall> = {
  'POST /v1/parties': async (s) => ({
    test: s.post('/v1/parties', await finance(s), organizationBody()),
  }),
  'PATCH /v1/parties/{id}': async (s) => {
    const body = organizationBody();
    const { session, id } = await newParty(s, body);
    const edit = { ...body, roles: undefined, city: 'Pasto' };
    return { test: s.patch(`/v1/parties/${id}`, session, edit, 1) };
  },
  'POST /v1/parties/{id}/actions/change-status': async (s) => {
    const { session, id } = await newParty(s);
    const path = `/v1/parties/${id}/actions/change-status`;
    return { test: withVersion(s.post(path, session, { status: 'inactive' }), 1) };
  },
  'POST /v1/parties/{id}/roles': async (s) => {
    const { session, id } = await newParty(s);
    return { test: s.post(`/v1/parties/${id}/roles`, session, { role: 'supplier' }) };
  },
  'DELETE /v1/parties/{id}/roles/{role}': async (s) => {
    const { session, id } = await newParty(s);
    return { test: del(s, `/v1/parties/${id}/roles/customer`, session) };
  },
  'POST /v1/parties/{id}/merge': async (s) => {
    const { session, id } = await newParty(s);
    const duplicate = await created(s, '/v1/parties', session, organizationBody());
    return { test: s.post(`/v1/parties/${id}/merge`, session, { duplicate_id: duplicate }) };
  },
};

const CONTACT_CALLS: Record<string, RouteCall> = {
  'POST /v1/parties/{id}/contacts': async (s) => {
    const { session, id } = await newParty(s);
    const person = await created(s, '/v1/parties', session, {
      ...personBody(),
      consent: await consentFor(s),
    });
    return { test: s.post(`/v1/parties/${id}/contacts`, session, { person_id: person }) };
  },
  'PATCH /v1/parties/{id}/contacts/{contactId}': async (s) => {
    const { session, id } = await newParty(s);
    const person = await created(s, '/v1/parties', session, {
      ...personBody(),
      consent: await consentFor(s),
    });
    const contact = await created(s, `/v1/parties/${id}/contacts`, session, { person_id: person });
    const body = { job_title: 'Gerente de compras', is_primary: true, can_sign: true };
    return { test: s.patch(`/v1/parties/${id}/contacts/${contact}`, session, body, 1) };
  },
  'DELETE /v1/parties/{id}/contacts/{contactId}': async (s) => {
    const { session, id } = await newParty(s);
    const person = await created(s, '/v1/parties', session, {
      ...personBody(),
      consent: await consentFor(s),
    });
    const contact = await created(s, `/v1/parties/${id}/contacts`, session, { person_id: person });
    return { test: del(s, `/v1/parties/${id}/contacts/${contact}`, session, 1) };
  },
};

const RECORD_CALLS: Record<string, RouteCall> = {
  'POST /v1/parties/{id}/bank-accounts': async (s) => {
    const { session, id } = await newParty(s);
    return { test: s.post(`/v1/parties/${id}/bank-accounts`, session, ACCOUNT) };
  },
  'POST /v1/parties/{id}/bank-accounts/{accountId}/actions/approve': async (s) => {
    const { session, id } = await newParty(s);
    const account = await pendingAccount(s, id);
    const path = `/v1/parties/${id}/bank-accounts/${account}/actions/approve`;
    return { test: s.post(path, session) };
  },
  'POST /v1/parties/{id}/bank-accounts/{accountId}/actions/reject': async (s) => {
    const { session, id } = await newParty(s);
    const account = await pendingAccount(s, id);
    const path = `/v1/parties/${id}/bank-accounts/${account}/actions/reject`;
    return { test: s.post(path, session, { note: 'No coincide el titular' }) };
  },
  'POST /v1/parties/{id}/bank-accounts/{accountId}/actions/reveal': async (s) => {
    const { session, id } = await newParty(s);
    const account = await created(s, `/v1/parties/${id}/bank-accounts`, session, {
      ...ACCOUNT,
      account_number: uniqueNumber(),
    });
    return { test: s.post(`/v1/parties/${id}/bank-accounts/${account}/actions/reveal`, session) };
  },
  'POST /v1/parties/{id}/due-diligence': async (s) => {
    const { session, id } = await newParty(s);
    return { test: s.post(`/v1/parties/${id}/due-diligence`, session, REVIEW) };
  },
  'POST /v1/parties/{id}/due-diligence/{reviewId}/actions/approve': async (s) => {
    const { id } = await newParty(s);
    const review = await pendingReview(s, id);
    const path = `/v1/parties/${id}/due-diligence/${review}/actions/approve`;
    return { test: s.post(path, await director(s)) };
  },
  'POST /v1/parties/{id}/due-diligence/{reviewId}/actions/reject': async (s) => {
    const { id } = await newParty(s);
    const review = await pendingReview(s, id);
    const path = `/v1/parties/${id}/due-diligence/${review}/actions/reject`;
    return { test: s.post(path, await director(s), { note: 'Faltan documentos' }) };
  },
};

export const PARTY_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...PARTY_CALLS,
  ...CONTACT_CALLS,
  ...RECORD_CALLS,
};
