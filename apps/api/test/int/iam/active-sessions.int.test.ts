import { activeSessionsResponseSchema, closedSessionsResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  GOOD_PASSWORD,
  auditActions,
  errorCode,
  postWithSession,
  profileOf,
  signIn,
  type SignedIn,
} from './support/iam-fixtures.js';
import { IamScenario } from './support/iam-scenario.js';

// Sesiones activas (B09, ficha 17.2): cada persona ve dónde tiene sesión y puede cerrarla; el
// cierre surte efecto inmediato (criterio 3). Nadie ve ni cierra sesiones ajenas.

const scenario = new IamScenario('sesiones activas');

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

async function sessionsOf(signedIn: SignedIn) {
  const response = await scenario.get('/v1/me/sessions', signedIn);
  expect(response.status).toBe(200);
  return activeSessionsResponseSchema.parse(response.body).data;
}

async function otherSessionId(signedIn: SignedIn): Promise<string> {
  return (await sessionsOf(signedIn)).find((session) => !session.current)?.id ?? '';
}

function revoke(signedIn: SignedIn, sessionId: string) {
  return postWithSession(scenario.app, `/v1/me/sessions/${sessionId}/revoke`, signedIn);
}

describe('sesiones activas', () => {
  it('muestra cada sesión abierta, con su equipo, y marca la actual', async () => {
    const { email } = await scenario.newUser('lista');
    const laptop = await signIn(scenario.app, email);
    const phoneLogin = await request(scenario.app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '10.20.30.40')
      .set('User-Agent', ANDROID_CHROME)
      .send({ email, password: GOOD_PASSWORD });
    expect(phoneLogin.status).toBe(200);
    const sessions = await sessionsOf(laptop);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
    expect(sessions).toContainEqual(
      expect.objectContaining({
        ip: '10.20.30.40',
        browser: 'Chrome',
        os: 'Android',
        current: false,
        pending_second_factor: true,
      }),
    );
  });

  it('no muestra las sesiones cerradas ni las de otras personas', async () => {
    const { email } = await scenario.newUser('solo-mias');
    const other = await scenario.newUser('otra-persona');
    const mine = await signIn(scenario.app, email);
    await signIn(scenario.app, other.email);
    const closed = await signIn(scenario.app, email);
    await postWithSession(scenario.app, '/v1/auth/logout', closed);
    const sessions = await sessionsOf(mine);
    expect(sessions.map((session) => session.current)).toEqual([true]);
  });

  it('sin sesión no hay lista (permiso denegado)', async () => {
    const response = await request(scenario.app.getHttpServer()).get('/v1/me/sessions');
    expect(response.status).toBe(401);
  });
});

describe('cerrar una sesión desde otro dispositivo surte efecto inmediato (criterio 3)', () => {
  it('la sesión cerrada deja de servir en su siguiente petición', async () => {
    const { email } = await scenario.newUser('remoto');
    const office = await signIn(scenario.app, email);
    const home = await signIn(scenario.app, email);
    expect(await profileOf(scenario.app, home.cookie)).not.toBeNull();
    expect((await revoke(office, await otherSessionId(office))).status).toBe(204);
    expect(await profileOf(scenario.app, home.cookie)).toBeNull();
    expect(await profileOf(scenario.app, office.cookie)).not.toBeNull();
  });

  it('deja auditoría con el motivo', async () => {
    const { email } = await scenario.newUser('remoto-audita');
    const office = await signIn(scenario.app, email);
    await signIn(scenario.app, email);
    const target = await otherSessionId(office);
    await revoke(office, target);
    const actions = await auditActions(scenario.db, scenario.tenant.id, target);
    expect(actions).toContain('iam.session.revoke:success');
    const session = await scenario.inTenant((tx) =>
      tx.session.findUniqueOrThrow({ where: { id: target } }),
    );
    expect(session.revokedReason).toBe('remote_revoke');
  });

  it('«cerrar todas las demás» deja solo la actual', async () => {
    const { email } = await scenario.newUser('todas');
    const keep = await signIn(scenario.app, email);
    const others = [await signIn(scenario.app, email), await signIn(scenario.app, email)];
    const response = await postWithSession(scenario.app, '/v1/me/sessions/revoke-others', keep);
    expect(closedSessionsResponseSchema.parse(response.body).closed).toBe(2);
    for (const other of others) expect(await profileOf(scenario.app, other.cookie)).toBeNull();
    expect(await profileOf(scenario.app, keep.cookie)).not.toBeNull();
  });
});

describe('cerrar sesiones exige el código antifalsificación (permiso denegado)', () => {
  it('sin el código no cierra nada', async () => {
    const { email } = await scenario.newUser('sin-codigo');
    const office = await signIn(scenario.app, email);
    const home = await signIn(scenario.app, email);
    const response = await request(scenario.app.getHttpServer())
      .post(`/v1/me/sessions/${await otherSessionId(office)}/revoke`)
      .set('Cookie', office.cookie);
    expect(response.status).toBe(403);
    expect(await profileOf(scenario.app, home.cookie)).not.toBeNull();
  });
});

describe('nadie cierra sesiones ajenas (aislamiento)', () => {
  it('la sesión de otra persona de la misma empresa responde 404 y sigue abierta', async () => {
    const intruder = await signIn(scenario.app, (await scenario.newUser('intrusa')).email);
    const victim = await signIn(scenario.app, (await scenario.newUser('victima')).email);
    const victimId = (await sessionsOf(victim))[0]?.id ?? '';
    const response = await revoke(intruder, victimId);
    expect(response.status).toBe(404);
    expect(errorCode(response)).toBe('SESSION_NOT_FOUND');
    expect(await profileOf(scenario.app, victim.cookie)).not.toBeNull();
  });

  it('la sesión de otra empresa tampoco se ve ni se cierra', async () => {
    const outsiderUser = await scenario.newUser('empresa-b', { tenantId: scenario.otherTenant.id });
    const outsider = await signIn(scenario.app, outsiderUser.email);
    const local = await signIn(scenario.app, (await scenario.newUser('empresa-a')).email);
    const outsiderId = (await sessionsOf(outsider))[0]?.id ?? '';
    expect((await sessionsOf(local)).map((session) => session.id)).not.toContain(outsiderId);
    expect((await revoke(local, outsiderId)).status).toBe(404);
    expect(await profileOf(scenario.app, outsider.cookie)).not.toBeNull();
  });

  it('un identificador mal formado se rechaza sin consultar', async () => {
    const signedIn = await signIn(scenario.app, (await scenario.newUser('formato')).email);
    expect((await revoke(signedIn, 'no-es-uuid')).status).toBe(400);
  });
});
