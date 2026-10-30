import { myPermissionsResponseSchema, type MyPermissionsResponse } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { HOUR, errorCode, tenantScope, type SignedIn } from './support/iam-fixtures.js';
import { AccessScenario, giveRole } from './support/access-scenario.js';

// Permisos vigentes de cada persona (B10): la suma de sus roles vigentes, calculada en cada
// petición. Permiso denegado en cada punto nuevo de la API y aislamiento entre empresas.

const scenario = new AccessScenario('permisos');
const UNKNOWN_ID = '01999a00-0000-7000-8000-00000000ffff';

async function permissionsOf(session: SignedIn): Promise<MyPermissionsResponse> {
  const response = await scenario.get('/v1/me/permissions', session);
  expect(response.status).toBe(200);
  return myPermissionsResponseSchema.parse(response.body);
}

function codes(permissions: MyPermissionsResponse): string[] {
  return permissions.permissions.map((permission) => permission.code);
}

describe('mis permisos (GET /v1/me/permissions)', () => {
  it('sin roles, no hay permisos', async () => {
    const nobody = await scenario.person('sin-roles', []);
    expect(await permissionsOf(nobody.session)).toEqual({ roles: [], permissions: [] });
  });

  it('los permisos de varios roles se suman', async () => {
    const both = await scenario.person('dos-roles', ['COMERCIAL', 'AUDITOR']);
    const mine = await permissionsOf(both.session);
    expect(mine.roles.map((role) => role.code).sort()).toEqual(['AUDITOR', 'COMERCIAL']);
    expect(codes(mine)).toEqual(expect.arrayContaining(['crm.quote.send', 'audit.event.read']));
  });

  it('COLABORADOR delega solo lo propio', async () => {
    const worker = await scenario.person('colaborador', ['COLABORADOR']);
    const mine = await permissionsOf(worker.session);
    expect(mine.permissions).toContainEqual({ code: 'iam.delegation.manage', scope: 'own' });
  });
});

describe('vigencia de los roles', () => {
  it('un rol vencido deja de contar', async () => {
    const temporary = await scenario.person('vencido', []);
    const target = { tenantId: scenario.tenant.id, userId: temporary.id };
    const from = scenario.clock.now();
    const until = new Date(from.getTime() + HOUR);
    await giveRole(scenario.db, target, 'DIRECCION', { from, until });
    expect(codes(await permissionsOf(temporary.session))).toContain('iam.user.read');
    scenario.clock.advance(2 * HOUR);
    const later = await scenario.refresh(temporary);
    expect(codes(await permissionsOf(later.session))).not.toContain('iam.user.read');
  });

  it('retirar un rol surte efecto en la siguiente petición', async () => {
    const director = await scenario.person('retirado', ['DIRECCION']);
    expect((await scenario.get('/v1/users', director.session)).status).toBe(200);
    await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.userRole.updateMany({
        where: { userId: director.id },
        data: { revokedAt: scenario.clock.now() },
      }),
    );
    expect((await scenario.get('/v1/users', director.session)).status).toBe(403);
  });
});

/** Cada punto nuevo de B10, con su método. */
const GUARDED: readonly (readonly ['get' | 'post', string])[] = [
  ['get', '/v1/users'],
  ['get', `/v1/users/${UNKNOWN_ID}`],
  ['post', '/v1/users'],
  ['post', `/v1/users/${UNKNOWN_ID}/actions/invite`],
  ['post', `/v1/users/${UNKNOWN_ID}/actions/lock`],
  ['post', `/v1/users/${UNKNOWN_ID}/actions/unlock`],
  ['post', `/v1/users/${UNKNOWN_ID}/actions/reset-mfa`],
  ['post', `/v1/users/${UNKNOWN_ID}/actions/revoke-sessions`],
  ['post', '/v1/sessions/actions/revoke-all'],
  ['post', `/v1/users/${UNKNOWN_ID}/roles`],
  ['post', `/v1/users/${UNKNOWN_ID}/roles/${UNKNOWN_ID}/actions/revoke`],
  ['get', '/v1/permissions'],
  ['get', '/v1/roles'],
  ['get', `/v1/roles/${UNKNOWN_ID}`],
  ['post', '/v1/roles'],
  ['get', '/v1/delegations'],
  ['post', '/v1/delegations'],
  ['post', `/v1/delegations/${UNKNOWN_ID}/actions/revoke`],
  ['get', '/v1/access-review'],
];

describe('permiso denegado en cada punto nuevo', () => {
  it.each(GUARDED)('%s %s responde 403 a quien no tiene roles', async (method, path) => {
    const nobody = await scenario.person(`denegado-${method}`, []);
    const response =
      method === 'get'
        ? await scenario.get(path, nobody.session)
        : await scenario.post(path, nobody.session, {});
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });

  it('editar un rol también exige su permiso', async () => {
    const auditor = await scenario.person('auditor-edita', ['AUDITOR']);
    const response = await scenario.patch(`/v1/roles/${UNKNOWN_ID}`, auditor.session, {}, 1);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });

  it('el AUDITOR lee usuarios y roles, pero no puede asignar ni invitar', async () => {
    const auditor = await scenario.person('auditor', ['AUDITOR']);
    expect((await scenario.get('/v1/users', auditor.session)).status).toBe(200);
    expect((await scenario.get('/v1/roles', auditor.session)).status).toBe(200);
    expect((await scenario.post('/v1/users', auditor.session, {})).status).toBe(403);
  });
});

describe('aislamiento entre empresas', () => {
  it('el administrador de una empresa no ve usuarios ni roles de otra: 404', async () => {
    const admin = await scenario.person('admin-a', ['ADMIN_PLATAFORMA']);
    const other = await scenario.newUser('persona-b', { tenantId: scenario.otherTenant.id });
    const otherRole = await scenario.roleId('COMERCIAL', scenario.otherTenant.id);
    expect((await scenario.get(`/v1/users/${other.id}`, admin.session)).status).toBe(404);
    expect((await scenario.get(`/v1/roles/${otherRole}`, admin.session)).status).toBe(404);
  });

  it('los permisos de una empresa no valen en otra', async () => {
    const adminB = await scenario.person('admin-b', ['ADMIN_PLATAFORMA'], {
      tenantId: scenario.otherTenant.id,
    });
    const listing = await scenario.get('/v1/users', adminB.session);
    const emails = (listing.body as { data: { email: string }[] }).data.map((user) => user.email);
    expect(emails).toContain(adminB.email);
    expect(emails.every((email) => !email.startsWith('admin-a'))).toBe(true);
  });
});
