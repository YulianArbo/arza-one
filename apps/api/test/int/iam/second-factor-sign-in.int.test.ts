import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { DEVICE_COOKIE } from '../../../src/modules/iam/application/session-cookie.js';
import {
  GOOD_PASSWORD,
  MINUTE,
  accountEmailJobs,
  auditActions,
  cookieValue,
  currentCode,
  errorCode,
  postWithSession,
  profileOf,
  signIn,
  signInWithPassword,
  signedInFrom,
  type SignedIn,
} from './support/iam-fixtures.js';
import { IamScenario } from './support/iam-scenario.js';

// Segundo paso del inicio de sesión (numeral 15.1, B09): código de la aplicación o de
// recuperación, un solo uso, bloqueo al quinto fallo, obligatoriedad por tipo de usuario y aviso
// de dispositivo nuevo (numeral 15.5).

const scenario = new IamScenario('segundo paso');

function verify(pending: SignedIn, body: { code?: string; recovery_code?: string }) {
  return postWithSession(scenario.app, '/v1/auth/mfa/verify', pending, body);
}

describe('segundo paso del inicio de sesión', () => {
  it('pide el código a quien tiene segundo factor y lo completa con una llave nueva', async () => {
    const { email } = await scenario.newUser('codigo');
    const pending = await signInWithPassword(scenario.app, email);
    expect(pending.session.stage).toBe('second_factor');
    scenario.nextCodePeriod();
    const response = await verify(pending, { code: currentCode(email, scenario.clock) });
    const completed = signedInFrom(response, 'El segundo factor');
    expect(completed.session.stage).toBe('complete');
    expect(completed.token).not.toBe(pending.token);
    expect(await profileOf(scenario.app, pending.cookie)).toBeNull();
    expect(await profileOf(scenario.app, completed.cookie)).not.toBeNull();
  });

  it('un mismo código no sirve dos veces', async () => {
    const { email } = await scenario.newUser('repetido');
    scenario.nextCodePeriod();
    const code = currentCode(email, scenario.clock);
    const first = await signInWithPassword(scenario.app, email);
    expect((await verify(first, { code })).status).toBe(200);
    const second = await signInWithPassword(scenario.app, email);
    const replay = await verify(second, { code });
    expect(replay.status).toBe(422);
    expect(errorCode(replay)).toBe('SECOND_FACTOR_CODE_INVALID');
  });

  it('deja auditoría de los dos pasos', async () => {
    const { email, id } = await scenario.newUser('audita-paso');
    await signIn(scenario.app, email);
    const session = await scenario.inTenant((tx) =>
      tx.session.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(await auditActions(scenario.db, scenario.tenant.id, session.id)).toEqual([
      'iam.session.create:success',
      'iam.mfa.verify:success',
    ]);
  });
});

describe('lo que el segundo paso no permite', () => {
  it('una sesión completa no lo repite', async () => {
    const { email } = await scenario.newUser('ya-completa');
    const signedIn = await signIn(scenario.app, email);
    scenario.nextCodePeriod();
    const response = await verify(signedIn, { code: currentCode(email, scenario.clock) });
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('SIGN_IN_ALREADY_COMPLETE');
  });

  it('quien ya tiene segundo factor no puede configurar otro sin entrar primero', async () => {
    const { email } = await scenario.newUser('sin-atajo');
    const pending = await signInWithPassword(scenario.app, email);
    const response = await postWithSession(scenario.app, '/v1/auth/mfa/setup', pending);
    expect(response.status).toBe(409);
    expect(errorCode(response)).toBe('SECOND_FACTOR_ALREADY_CONFIGURED');
  });

  it('el código y el de recuperación no se envían juntos', async () => {
    const { email } = await scenario.newUser('ambos');
    const pending = await signInWithPassword(scenario.app, email);
    const response = await verify(pending, {
      code: '123456',
      recovery_code: 'ABCD-EFGH-JKMN-PQRS',
    });
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('VALIDATION_FAILED');
  });
});

describe('códigos de recuperación', () => {
  it('cada uno sirve una sola vez, escrito como sea', async () => {
    const { email, recoveryCodes } = await scenario.configuredUser('recupera');
    const recovery = recoveryCodes[0] ?? '';
    const first = await signInWithPassword(scenario.app, email);
    const typed = recovery.toLowerCase().replaceAll('-', ' ');
    expect((await verify(first, { recovery_code: typed })).status).toBe(200);
    const second = await signInWithPassword(scenario.app, email);
    expect((await verify(second, { recovery_code: recovery })).status).toBe(422);
  });

  it('usar uno deja el evento de seguridad y el aviso con los que quedan', async () => {
    const { email, id, recoveryCodes } = await scenario.configuredUser('aviso-codigo');
    const pending = await signInWithPassword(scenario.app, email);
    await verify(pending, { recovery_code: recoveryCodes[1] ?? '' });
    const events = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { userId: id, type: 'iam.mfa.recovery_code_used' } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toEqual({ remaining: 9 });
    expect(await accountEmailJobs(id, 'recovery_code_used')).toHaveLength(1);
  });
});

async function failFive(pending: SignedIn): Promise<request.Response> {
  let last: request.Response | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await verify(pending, { code: '000000' });
  }
  if (last === undefined) throw new Error('Sin intentos');
  return last;
}

describe('cinco códigos equivocados', () => {
  it('cierran la sesión y bloquean la cuenta 15 minutos', async () => {
    const { email } = await scenario.newUser('cinco');
    const pending = await signInWithPassword(scenario.app, email);
    const fifth = await failFive(pending);
    expect(fifth.status).toBe(429);
    expect(errorCode(fifth)).toBe('ACCOUNT_LOCKED');
    expect((await scenario.get('/v1/auth/session', pending)).status).toBe(401);
    const login = await request(scenario.app.getHttpServer())
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '10.9.9.9')
      .send({ email, password: GOOD_PASSWORD });
    expect(errorCode(login)).toBe('ACCOUNT_LOCKED');
    scenario.clock.advance(15 * MINUTE);
    expect((await signIn(scenario.app, email)).session.stage).toBe('complete');
  });

  it('registran el evento de seguridad grave, la alerta y la auditoría', async () => {
    const { email, id } = await scenario.newUser('grave');
    await failFive(await signInWithPassword(scenario.app, email));
    const { events, alerts, session } = await scenario.inTenant(async (tx) => ({
      events: await tx.securityEvent.findMany({ where: { userId: id, type: 'iam.mfa.failures' } }),
      alerts: await tx.outboxEvent.findMany({ where: { eventType: 'security.alert' } }),
      session: await tx.session.findFirstOrThrow({ where: { userId: id } }),
    }));
    expect(events.map((event) => event.severity)).toEqual(['high']);
    expect(alerts.map((alert) => alert.payload)).toContainEqual({
      type: 'iam.mfa.failures',
      user_id: id,
    });
    expect(session.revokedReason).toBe('mfa_failures');
    const actions = await auditActions(scenario.db, scenario.tenant.id, session.id);
    expect(actions.filter((action) => action === 'iam.mfa.verify:failure')).toHaveLength(5);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toContain(
      'iam.user.lock:success',
    );
  });
});

describe('obligatoriedad por tipo de usuario', () => {
  it('en el portal, sin la marca, se entra solo con la contraseña', async () => {
    const { email } = await scenario.newUser('portal-libre', { kind: 'portal' });
    expect((await signInWithPassword(scenario.app, email)).session.stage).toBe('complete');
  });

  it('un administrador de cliente con la marca debe configurarlo', async () => {
    const { email } = await scenario.newUser('portal-admin', {
      kind: 'portal',
      requireSecondFactor: true,
    });
    const pending = await signInWithPassword(scenario.app, email);
    expect(pending.session.stage).toBe('second_factor_setup');
  });

  it('quien lo activó por su cuenta lo usa aunque sea opcional', async () => {
    const { email } = await scenario.newUser('portal-voluntario', {
      kind: 'portal',
      withSecondFactor: true,
    });
    expect((await signInWithPassword(scenario.app, email)).session.stage).toBe('second_factor');
  });
});

describe('inicio de sesión desde un dispositivo nuevo (numeral 15.5)', () => {
  it('el primer equipo no avisa; uno distinto sí; el mismo, no', async () => {
    const { email, id } = await scenario.newUser('equipos');
    scenario.nextCodePeriod();
    const firstLogin = await signInWithPassword(scenario.app, email);
    const first = await verify(firstLogin, { code: currentCode(email, scenario.clock) });
    const device = cookieValue(first.headers['set-cookie'], DEVICE_COOKIE);
    expect(device).not.toBeNull();
    expect(String(first.headers['set-cookie'])).toMatch(/__Host-arza_device=.*HttpOnly/);
    await signIn(scenario.app, email, { cookies: [`${DEVICE_COOKIE}=${device ?? ''}`] });
    await signIn(scenario.app, email);
    const alerts = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { userId: id, type: 'iam.login.new_device' } }),
    );
    expect(alerts).toHaveLength(1);
    expect(await accountEmailJobs(id, 'new_device')).toHaveLength(1);
    const devices = await scenario.inTenant((tx) =>
      tx.knownDevice.count({ where: { userId: id } }),
    );
    expect(devices).toBe(2);
  });
});

describe('los códigos equivocados se cuentan por persona, no por sesión', () => {
  it('abrir otra sesión con la contraseña no reinicia la cuenta', async () => {
    const { email } = await scenario.newUser('otra-sesion');
    const first = await signInWithPassword(scenario.app, email);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await verify(first, { code: '000000' })).status).toBe(422);
    }
    const second = await signInWithPassword(scenario.app, email);
    const fifth = await verify(second, { code: '000000' });
    expect(errorCode(fifth)).toBe('ACCOUNT_LOCKED');
    expect((await scenario.get('/v1/auth/session', first)).status).toBe(401);
    expect((await scenario.get('/v1/auth/session', second)).status).toBe(401);
  });

  it('un acierto vuelve a empezar la cuenta', async () => {
    const { email } = await scenario.newUser('acierto');
    const first = await signInWithPassword(scenario.app, email);
    for (let attempt = 0; attempt < 4; attempt += 1) await verify(first, { code: '000000' });
    scenario.nextCodePeriod();
    expect((await verify(first, { code: currentCode(email, scenario.clock) })).status).toBe(200);
    const second = await signInWithPassword(scenario.app, email);
    expect((await verify(second, { code: '000000' })).status).toBe(422);
  });
});
