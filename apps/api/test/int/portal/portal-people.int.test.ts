import {
  portalDataExportSchema,
  portalMyDataSchema,
  portalUserListSchema,
  type PortalUserList,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { PortalScenario } from './support/portal-scenario.js';

// Las personas en el portal (B30, ficha 17.10): el administrador del cliente invita, cambia de rol y
// desactiva a los de su empresa, pero no a sí mismo ni a otra empresa; cada persona consulta,
// corrige y descarga sus datos. Los cambios de permisos dejan su alerta y todo queda auditado.
// Datos ficticios.

const scenario = new PortalScenario('portal: personas');

async function users(admin: Person): Promise<PortalUserList> {
  return portalUserListSchema.parse(await scenario.read(admin, '/v1/portal/users'));
}

describe('invitar', () => {
  it('el administrador invita a una persona de su empresa, pero no un correo ajeno', async () => {
    const world = await scenario.clientWorld();
    const email = `nueva-${crypto.randomUUID().slice(0, 8)}@cliente.test`;
    const invite = { email, display_name: 'Persona Nueva', role: 'CLIENTE_USUARIO' };
    const invited = await scenario.portalPost(world.admin, '/v1/portal/users', invite);
    expect(invited.status, invited.text).toBe(201);
    const row = (await users(world.admin)).data.find((user) => user.email === email);
    expect(row).toMatchObject({ role: 'CLIENTE_USUARIO', status: 'invited', is_me: false });
    const taken = { ...invite, email: world.leader.email };
    expect((await scenario.portalPost(world.admin, '/v1/portal/users', taken)).status).toBe(422);
    const other = await scenario.clientWorld();
    const foreign = { ...invite, email: other.user.email };
    expect((await scenario.portalPost(world.admin, '/v1/portal/users', foreign)).status).toBe(422);
  });
});

it('cambia el rol y desactiva a otro, nunca a sí mismo, con su auditoría', async () => {
  const world = await scenario.clientWorld();
  const path = `/v1/portal/users/${world.user.id}`;
  const version =
    (await users(world.admin)).data.find((row) => row.id === world.user.id)?.version ?? 0;
  const promote = await scenario.put(
    path,
    world.admin,
    { role: 'CLIENTE_ADMIN', active: true },
    version,
  );
  expect(promote.status, promote.text).toBe(204);
  const promoted = (await users(world.admin)).data.find((row) => row.id === world.user.id);
  expect(promoted?.role).toBe('CLIENTE_ADMIN');
  const off = await scenario.put(
    path,
    world.admin,
    { role: 'CLIENTE_ADMIN', active: false },
    promoted?.version ?? 0,
  );
  expect(off.status, off.text).toBe(204);
  expect((await scenario.get('/v1/portal/home', world.user.session)).status).toBe(401);
  const self = `/v1/portal/users/${world.admin.id}`;
  const me = (await users(world.admin)).data.find((row) => row.is_me);
  const own = await scenario.put(
    self,
    world.admin,
    { role: 'CLIENTE_USUARIO', active: true },
    me?.version ?? 0,
  );
  expect(own.status).toBe(422);
  const actions = await scenario.auditActionsOf(world.user.id);
  expect(actions).toEqual(expect.arrayContaining(['iam.role.assign', 'iam.portal_user.status']));
});
it('rechaza cambios de rol con una versión obsoleta', async () => {
  const world = await scenario.clientWorld();
  const row = (await users(world.admin)).data.find((user) => user.id === world.user.id);
  if (row === undefined) throw new Error('No aparece el usuario del portal');
  const outdated = await scenario.put(
    `/v1/portal/users/${row.id}`,
    world.admin,
    { role: 'CLIENTE_ADMIN', active: true },
    row.version + 1,
  );
  expect(outdated.status).toBe(409);
});

describe('mis datos', () => {
  it('consulta, corrige y descarga sus datos; la descarga queda registrada', async () => {
    const world = await scenario.clientWorld();
    const mine = portalMyDataSchema.parse(await scenario.read(world.user, '/v1/portal/me'));
    expect(mine).toMatchObject({ role: 'CLIENTE_USUARIO', email: world.user.email });
    expect(mine.terms_accepted_at).not.toBeNull();
    const renamed = await scenario.put(
      '/v1/portal/me',
      world.user,
      { display_name: 'Ana Cliente' },
      mine.version,
    );
    expect(renamed.status, renamed.text).toBe(204);
    const stale = await scenario.put(
      '/v1/portal/me',
      world.user,
      { display_name: 'Otra' },
      mine.version,
    );
    expect(stale.status).toBe(409);
    const exported = await scenario.portalPost(world.user, '/v1/portal/me/export');
    expect(exported.status, exported.text).toBe(201);
    const copy = portalDataExportSchema.parse(exported.body);
    expect(copy.account.display_name).toBe('Ana Cliente');
    expect(copy.terms).toHaveLength(2);
    expect(JSON.stringify(exported.body)).not.toMatch(/password|token|secret/iu);
    expect(await scenario.auditedActions(world.user)).toEqual(
      expect.arrayContaining(['iam.portal_user.rename', 'iam.portal_user.export']),
    );
  });
});
