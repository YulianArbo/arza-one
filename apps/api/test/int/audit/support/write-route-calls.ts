import {
  activeSessionsResponseSchema,
  createdResponseSchema,
  roleListResponseSchema,
} from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { totpCodeAt } from '../../../../src/modules/iam/infrastructure/totp.js';
import {
  GOOD_PASSWORD,
  accountEmailJob,
  createUser,
  currentCode,
  linkTokenFromEmail,
  postFromWeb,
  postWithSession,
  signIn,
  signInWithPassword,
  uniqueEmail,
} from '../../iam/support/iam-fixtures.js';
import { giveRole, type AccessScenario, type Person } from '../../iam/support/access-scenario.js';
import { CORE_CALLS } from './core-route-calls.js';
import { CRM_ROUTE_CALLS } from './crm-route-calls.js';
import { DOC_DOCUMENT_ROUTE_CALLS } from './doc-document-route-calls.js';
import { DOC_FORM_ROUTE_CALLS } from './doc-form-route-calls.js';
import { DOC_REQUEST_ROUTE_CALLS } from './doc-request-route-calls.js';
import { DOC_RETENTION_ROUTE_CALLS } from './doc-retention-route-calls.js';
import { DOC_ROUTE_CALLS } from './doc-route-calls.js';
import { FINANCE_ROUTE_CALLS } from './finance-route-calls.js';
import { MEDIA_ROUTE_CALLS } from './media-route-calls.js';
import { NTF_ROUTE_CALLS } from './ntf-route-calls.js';
import { PARTY_ROUTE_CALLS } from './party-route-calls.js';
import { PRIVACY_ROUTE_CALLS } from './privacy-route-calls.js';
import { PORTAL_ROUTE_CALLS } from './portal-route-calls.js';
import { PROJECT_CONTROL_ROUTE_CALLS } from './project-control-route-calls.js';
import { SERVICE_ROUTE_CALLS } from './service-route-calls.js';
import { CARE_ROUTE_CALLS } from './care-route-calls.js';
import { PROJECT_ROUTE_CALLS } from './project-route-calls.js';
import { CONTRACT_ROUTE_CALLS } from './contract-route-calls.js';
import { QUOTE_ROUTE_CALLS } from './quote-route-calls.js';
import { WF_ROUTE_CALLS } from './wf-route-calls.js';

// Una petición válida a cada ruta de la API que escribe (B11, criterio de la ficha 17.20). Cada
// llamada prepara lo que necesita y devuelve la petición final sin enviar, para que la prueba le
// ponga su identificador de correlación y busque el evento de auditoría con ese identificador.

/** La petición va dentro de un objeto: una función async que la devolviera sola la enviaría. */
interface PendingRequest {
  readonly test: request.Test;
}

export type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const NEW_PASSWORD = 'arepa de choclo con queso';
const DAY = 24 * 60 * 60 * 1000;

function admin(scenario: AccessScenario): Promise<Person> {
  return scenario.person('admin', ['ADMIN_PLATAFORMA']);
}

/** Cuenta del portal sin segundo factor: entra solo con la contraseña. */
async function portalUser(scenario: AccessScenario, withSecondFactor = false) {
  return scenario.newUser('portal', { kind: 'portal', withSecondFactor });
}

async function userWithStatus(scenario: AccessScenario, status: 'invited' | 'locked') {
  const email = uniqueEmail(status);
  const id = await createUser(scenario.db, { tenantId: scenario.tenant.id, email, status });
  return { email, id };
}

async function linkToken(
  scenario: AccessScenario,
  userId: string,
  purpose: 'invitation' | 'password_reset',
): Promise<string> {
  const job = accountEmailJob(scenario.tenant.id, userId, purpose);
  return linkTokenFromEmail(scenario.clock, job);
}

async function createDelegation(scenario: AccessScenario) {
  const lead = await scenario.person('delega', ['COLABORADOR', 'ADMIN_FINANCIERO']);
  const backup = await scenario.person('recibe', ['COLABORADOR']);
  const start = scenario.clock.now();
  const call = scenario.post('/v1/delegations', lead.session, {
    starts_at: start.toISOString(),
    ends_at: new Date(start.getTime() + 10 * DAY).toISOString(),
    reason: 'Vacaciones de fin de año',
    permissions: ['finance.invoice.approve'],
    to_user_id: backup.id,
  });
  return { lead, call };
}

function newRole(scenario: AccessScenario, person: Person): request.Test {
  return scenario.post('/v1/roles', person.session, {
    name: `Apoyo ${uuidv7().slice(-8)}`,
    audience: 'internal',
    permissions: [{ code: 'crm.lead.read', scope: 'all' }],
  });
}

async function otherSessionId(scenario: AccessScenario, email: string) {
  const first = await signIn(scenario.app, email);
  await signIn(scenario.app, email);
  const list = activeSessionsResponseSchema.parse(
    (await scenario.get('/v1/me/sessions', first)).body,
  );
  return { first, id: list.data.find((session) => !session.current)?.id ?? '' };
}

const AUTH_CALLS: Record<string, RouteCall> = {
  'POST /v1/auth/login': async (s) => {
    const { email } = await portalUser(s);
    return final(postFromWeb(s.app, '/v1/auth/login', { email, password: GOOD_PASSWORD }));
  },
  'POST /v1/auth/mfa/verify': async (s) => {
    const { email } = await s.newUser('segundo-paso');
    const pending = await signInWithPassword(s.app, email);
    return final(
      postWithSession(s.app, '/v1/auth/mfa/verify', pending, {
        code: currentCode(email, s.clock),
      }),
    );
  },
  'POST /v1/auth/mfa/setup': async (s) => {
    const { email } = await s.newUser('configura', { withSecondFactor: false });
    return final(
      postWithSession(s.app, '/v1/auth/mfa/setup', await signInWithPassword(s.app, email)),
    );
  },
  'POST /v1/auth/mfa/setup/confirm': async (s) => {
    const { email } = await s.newUser('confirma', { withSecondFactor: false });
    const pending = await signInWithPassword(s.app, email);
    const setup = await s.startSetup(pending);
    const code = totpCodeAt(setup.secret, s.clock.now());
    return final(postWithSession(s.app, '/v1/auth/mfa/setup/confirm', pending, { code }));
  },
  'POST /v1/auth/reauthenticate': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(
      postWithSession(s.app, '/v1/auth/reauthenticate', session, { password: GOOD_PASSWORD }),
    );
  },
  'POST /v1/auth/logout': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(postWithSession(s.app, '/v1/auth/logout', session));
  },
  'POST /v1/auth/password/forgot': async (s) => {
    const { email } = await portalUser(s);
    return final(postFromWeb(s.app, '/v1/auth/password/forgot', { email }));
  },
  'POST /v1/auth/password/reset': async (s) => {
    const token = await linkToken(s, (await portalUser(s)).id, 'password_reset');
    return final(postFromWeb(s.app, '/v1/auth/password/reset', { token, password: NEW_PASSWORD }));
  },
  'POST /v1/auth/invitation/accept': async (s) => {
    const token = await linkToken(s, (await userWithStatus(s, 'invited')).id, 'invitation');
    return final(
      postFromWeb(s.app, '/v1/auth/invitation/accept', {
        token,
        password: GOOD_PASSWORD,
        display_name: 'Ana Pérez',
      }),
    );
  },
};

const ME_CALLS: Record<string, RouteCall> = {
  'POST /v1/me/password': async (s) => {
    const session = await signIn(s.app, (await portalUser(s)).email);
    return final(
      postWithSession(s.app, '/v1/me/password', session, {
        current_password: GOOD_PASSWORD,
        new_password: NEW_PASSWORD,
      }),
    );
  },
  'POST /v1/me/mfa/recovery-codes': async (s) => {
    const session = await signIn(s.app, (await s.newUser('codigos')).email);
    return final(postWithSession(s.app, '/v1/me/mfa/recovery-codes', session));
  },
  'POST /v1/me/mfa/disable': async (s) => {
    const session = await signIn(s.app, (await portalUser(s, true)).email);
    return final(postWithSession(s.app, '/v1/me/mfa/disable', session));
  },
  'POST /v1/me/sessions/revoke-others': async (s) => {
    const { first } = await otherSessionId(s, (await portalUser(s)).email);
    return final(postWithSession(s.app, '/v1/me/sessions/revoke-others', first));
  },
  'POST /v1/me/sessions/{id}/revoke': async (s) => {
    const { first, id } = await otherSessionId(s, (await portalUser(s)).email);
    return final(postWithSession(s.app, `/v1/me/sessions/${id}/revoke`, first));
  },
};

const ACCESS_CALLS: Record<string, RouteCall> = {
  'POST /v1/delegations': async (s) => final((await createDelegation(s)).call),
  'POST /v1/delegations/{id}/actions/revoke': async (s) => {
    const { lead, call } = await createDelegation(s);
    const { id } = createdResponseSchema.parse((await call).body);
    return final(s.post(`/v1/delegations/${id}/actions/revoke`, lead.session));
  },
  'POST /v1/roles': async (s) => final(newRole(s, await admin(s))),
  'PATCH /v1/roles/{id}': async (s) => {
    const person = await admin(s);
    const { id } = createdResponseSchema.parse((await newRole(s, person)).body);
    const roles = roleListResponseSchema.parse((await s.get('/v1/roles', person.session)).body);
    const version = roles.data.find((role) => role.id === id)?.version ?? 0;
    return final(
      s.patch(`/v1/roles/${id}`, person.session, { description: 'Apoyo a ventas' }, version),
    );
  },
  'POST /v1/users/{id}/roles': async (s) => {
    const target = await s.newUser('recibe-rol');
    return final(
      s.post(`/v1/users/${target.id}/roles`, (await admin(s)).session, {
        role_id: await s.roleId('COMERCIAL'),
      }),
    );
  },
  'POST /v1/users/{id}/roles/{assignmentId}/actions/revoke': async (s) => {
    const target = await s.newUser('pierde-rol');
    const userId = target.id;
    const assignment = await giveRole(s.db, { tenantId: s.tenant.id, userId }, 'COMERCIAL', {
      from: s.clock.now(),
    });
    const path = `/v1/users/${userId}/roles/${assignment}/actions/revoke`;
    return final(s.post(path, (await admin(s)).session));
  },
};

function onUser(
  action: string,
  prepare: (s: AccessScenario) => Promise<{ id: string }>,
): RouteCall {
  return async (s) => {
    const target = await prepare(s);
    return final(s.post(`/v1/users/${target.id}/actions/${action}`, (await admin(s)).session));
  };
}

const USER_CALLS: Record<string, RouteCall> = {
  'POST /v1/users': async (s) =>
    final(
      s.post('/v1/users', (await admin(s)).session, {
        email: uniqueEmail('invitada'),
        kind: 'internal',
      }),
    ),
  'PATCH /v1/users/{id}': async (s) => {
    const target = await s.newUser('con-cargo');
    const position = await s.inTenant(async (tx) => {
      const code = `CG${uuidv7().slice(-8).toUpperCase()}`;
      const unit = await tx.orgUnit.create({
        data: { tenantId: s.tenant.id, code, name: 'Recorrido', kind: 'area' },
      });
      return tx.position.create({
        data: { tenantId: s.tenant.id, orgUnitId: unit.id, name: 'Recorrido' },
      });
    });
    const body = { position_id: position.id };
    return final(s.patch(`/v1/users/${target.id}`, (await admin(s)).session, body, 1));
  },
  'POST /v1/users/{id}/actions/invite': onUser('invite', (s) => userWithStatus(s, 'invited')),
  'POST /v1/users/{id}/actions/lock': onUser('lock', (s) => s.newUser('bloquear')),
  'POST /v1/users/{id}/actions/unlock': onUser('unlock', (s) => userWithStatus(s, 'locked')),
  'POST /v1/users/{id}/actions/reset-mfa': onUser('reset-mfa', (s) => s.newUser('reinicia')),
  'POST /v1/users/{id}/actions/revoke-sessions': onUser('revoke-sessions', async (s) => {
    const target = await s.newUser('cierra');
    await signIn(s.app, target.email);
    return target;
  }),
  // Cierra todas las sesiones de una empresa: se hace en la otra, para no tumbar las demás llamadas.
  'POST /v1/sessions/actions/revoke-all': async (s) => {
    const other = await s.person('admin-b', ['ADMIN_PLATAFORMA'], { tenantId: s.otherTenant.id });
    return final(s.post('/v1/sessions/actions/revoke-all', other.session));
  },
};

const AUDIT_CALLS: Record<string, RouteCall> = {
  'POST /v1/audit-exports': async (s) =>
    final(s.post('/v1/audit-exports', (await s.person('auditora', ['AUDITOR'])).session)),
  'POST /v1/audit-events/verify-chain': async (s) =>
    final(s.post('/v1/audit-events/verify-chain', (await admin(s)).session)),
};

/** Ruta del OpenAPI («POST /v1/users/{id}/roles») → cómo llamarla. */
export const WRITE_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...AUTH_CALLS,
  ...ME_CALLS,
  ...ACCESS_CALLS,
  ...USER_CALLS,
  ...AUDIT_CALLS,
  ...CORE_CALLS,
  ...PARTY_ROUTE_CALLS,
  ...DOC_ROUTE_CALLS,
  ...DOC_DOCUMENT_ROUTE_CALLS,
  ...DOC_REQUEST_ROUTE_CALLS,
  ...DOC_FORM_ROUTE_CALLS,
  ...DOC_RETENTION_ROUTE_CALLS,
  ...WF_ROUTE_CALLS,
  ...NTF_ROUTE_CALLS,
  ...PRIVACY_ROUTE_CALLS,
  ...CRM_ROUTE_CALLS,
  ...QUOTE_ROUTE_CALLS,
  ...CONTRACT_ROUTE_CALLS,
  ...PROJECT_ROUTE_CALLS,
  ...PROJECT_CONTROL_ROUTE_CALLS,
  ...SERVICE_ROUTE_CALLS,
  ...CARE_ROUTE_CALLS,
  ...PORTAL_ROUTE_CALLS,
  ...FINANCE_ROUTE_CALLS,
  ...MEDIA_ROUTE_CALLS,
};
