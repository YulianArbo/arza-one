import {
  closedSessionsResponseSchema,
  inviteUserResponseSchema,
  userDetailResponseSchema,
  userListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  accountEmailJobs,
  auditActions,
  errorCode,
  profileOf,
  signInWithPassword,
  uniqueEmail,
} from './support/iam-fixtures.js';
import { AccessScenario } from './support/access-scenario.js';

// Administración de usuarios (B10): consultar, invitar, bloquear y desbloquear. Nadie se lo hace
// a sí mismo; los datos de seguridad solo los ve quien puede administrarlos.

const scenario = new AccessScenario('usuarios');

describe('consultar usuarios', () => {
  it('pagina por cursor y filtra por estado y por texto', async () => {
    const director = await scenario.person('director-lista', ['DIRECCION']);
    const marker = `marcador-${String(Date.now())}`;
    for (const index of [1, 2, 3]) await scenario.newUser(`${marker}-${String(index)}`);
    const first = userListResponseSchema.parse(
      (await scenario.get(`/v1/users?q=${marker}&limit=2`, director.session)).body,
    );
    expect(first.data).toHaveLength(2);
    const next = await scenario.get(
      `/v1/users?q=${marker}&limit=2&cursor=${first.next_cursor ?? ''}`,
      director.session,
    );
    const second = userListResponseSchema.parse(next.body);
    expect(second.data).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
    const invited = await scenario.get('/v1/users?status=invited&limit=100', director.session);
    expect(
      userListResponseSchema.parse(invited.body).data.every((u) => u.status === 'invited'),
    ).toBe(true);
  });

  it('los datos de seguridad solo los ve quien puede administrarlos', async () => {
    const director = await scenario.person('director-ficha', ['DIRECCION']);
    const admin = await scenario.person('admin-ficha', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('ficha', ['COMERCIAL']);
    const asDirector = userDetailResponseSchema.parse(
      (await scenario.get(`/v1/users/${target.id}`, director.session)).body,
    );
    expect(asDirector.security).toBeNull();
    expect(asDirector.roles.map((role) => role.code)).toEqual(['COMERCIAL']);
    const asAdmin = userDetailResponseSchema.parse(
      (await scenario.get(`/v1/users/${target.id}`, admin.session)).body,
    );
    expect(asAdmin.security).toMatchObject({ second_factor: true, active_sessions: 1 });
  });
});

describe('invitar desde la pantalla', () => {
  it('invita con roles, suma COLABORADOR y queda a nombre de quien invitó', async () => {
    const admin = await scenario.person('invita', ['ADMIN_PLATAFORMA']);
    const response = await scenario.post('/v1/users', admin.session, {
      email: uniqueEmail('nueva'),
      kind: 'internal',
      role_ids: [await scenario.roleId('SERVICIO')],
    });
    expect(response.status).toBe(201);
    const { id, outcome } = inviteUserResponseSchema.parse(response.body);
    expect(outcome).toBe('invited');
    const roles = await scenario.inTenant((tx) =>
      tx.userRole.findMany({ where: { userId: id }, include: { role: true } }),
    );
    expect(roles.map((item) => item.role.code).sort()).toEqual(['COLABORADOR', 'SERVICIO']);
    expect(roles.every((item) => item.assignedBy === admin.id)).toBe(true);
    expect(await accountEmailJobs(id, 'invitation')).toHaveLength(1);
    const resend = await scenario.post(`/v1/users/${id}/actions/invite`, admin.session);
    expect(resend.status).toBe(204);
    expect(await accountEmailJobs(id, 'invitation')).toHaveLength(2);
  });

  it('una cuenta ya activa no se reinvita', async () => {
    const admin = await scenario.person('reinvita', ['ADMIN_PLATAFORMA']);
    const active = await scenario.newUser('activa');
    const response = await scenario.post(`/v1/users/${active.id}/actions/invite`, admin.session);
    expect(errorCode(response)).toBe('USER_STATE_INVALID');
  });
});

describe('bloquear y desbloquear', () => {
  it('bloquear cierra sus sesiones e impide entrar; desbloquear lo devuelve', async () => {
    const admin = await scenario.person('bloquea', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('bloqueada', ['COMERCIAL']);
    expect((await scenario.post(`/v1/users/${target.id}/actions/lock`, admin.session)).status).toBe(
      204,
    );
    expect(await profileOf(scenario.app, target.session.cookie)).toBeNull();
    await expect(signInWithPassword(scenario.app, target.email)).rejects.toThrow(/401/);
    const unlock = await scenario.post(`/v1/users/${target.id}/actions/unlock`, admin.session);
    expect(unlock.status).toBe(204);
    expect(await auditActions(scenario.db, scenario.tenant.id, target.id)).toEqual(
      expect.arrayContaining(['iam.user.lock:success', 'iam.user.unlock:success']),
    );
    const alerts = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({
        where: { userId: target.id, type: 'iam.account.locked_by_admin' },
      }),
    );
    expect(alerts).toHaveLength(1);
  });

  it('nadie se bloquea a sí mismo y una cuenta no activa no se bloquea', async () => {
    const admin = await scenario.person('auto-bloqueo', ['ADMIN_PLATAFORMA']);
    const self = await scenario.post(`/v1/users/${admin.id}/actions/lock`, admin.session);
    expect(errorCode(self)).toBe('SELF_ACTION_NOT_ALLOWED');
    const invited = await scenario.newUser('sin-activar', {});
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: invited.id }, data: { status: 'inactive' } }),
    );
    const response = await scenario.post(`/v1/users/${invited.id}/actions/lock`, admin.session);
    expect(errorCode(response)).toBe('USER_STATE_INVALID');
  });
});

describe('segundo factor y sesiones de otras personas', () => {
  it('reinicia el segundo factor de otra persona y cierra sus sesiones', async () => {
    const admin = await scenario.person('reinicia', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('perdio-celular', ['COMERCIAL']);
    const response = await scenario.post(`/v1/users/${target.id}/actions/reset-mfa`, admin.session);
    expect(closedSessionsResponseSchema.parse(response.body).closed).toBe(1);
    expect(await profileOf(scenario.app, target.session.cookie)).toBeNull();
    expect(await accountEmailJobs(target.id, 'mfa_reset')).toHaveLength(1);
    const self = await scenario.post(`/v1/users/${admin.id}/actions/reset-mfa`, admin.session);
    expect(errorCode(self)).toBe('SELF_ACTION_NOT_ALLOWED');
  });

  it('cierra las sesiones de una persona o de toda la empresa, salvo la propia', async () => {
    const admin = await scenario.person('cierra', ['ADMIN_PLATAFORMA']);
    const target = await scenario.person('cerrada', []);
    const one = await scenario.post(
      `/v1/users/${target.id}/actions/revoke-sessions`,
      admin.session,
    );
    expect(closedSessionsResponseSchema.parse(one.body).closed).toBe(1);
    const other = await scenario.person('otra-cerrada', []);
    const all = await scenario.post('/v1/sessions/actions/revoke-all', admin.session);
    expect(closedSessionsResponseSchema.parse(all.body).closed).toBeGreaterThan(0);
    expect(await profileOf(scenario.app, other.session.cookie)).toBeNull();
    expect(await profileOf(scenario.app, admin.session.cookie)).not.toBeNull();
  });

  it('las acciones sobre personas de otra empresa responden 404', async () => {
    const admin = await scenario.person('admin-ajeno', ['ADMIN_PLATAFORMA']);
    const foreign = await scenario.person('ajena-b', [], { tenantId: scenario.otherTenant.id });
    for (const action of ['lock', 'reset-mfa', 'revoke-sessions']) {
      const response = await scenario.post(
        `/v1/users/${foreign.id}/actions/${action}`,
        admin.session,
      );
      expect(response.status, action).toBe(404);
    }
    expect(await profileOf(scenario.app, foreign.session.cookie)).not.toBeNull();
  });
});
