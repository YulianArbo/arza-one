import { createdResponseSchema, roleListResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { giveRole } from '../../iam/support/access-scenario.js';
import { createUser, signIn, uniqueEmail } from '../../iam/support/iam-fixtures.js';

/** La petición va dentro de un objeto: una función async que la devolviera sola la enviaría. */
interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const DAY = 24 * 60 * 60 * 1000;

function admin(scenario: AccessScenario): Promise<Person> {
  return scenario.person('admin', ['ADMIN_PLATAFORMA']);
}

/** Usuaria en un estado concreto, para las acciones que solo aplican a ese estado. */
async function userWithStatus(scenario: AccessScenario, status: 'invited' | 'locked') {
  const email = uniqueEmail(status);
  const id = await createUser(scenario.db, { tenantId: scenario.tenant.id, email, status });
  return { email, id };
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

export const ACCESS_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...ACCESS_CALLS,
  ...USER_CALLS,
  ...AUDIT_CALLS,
};
