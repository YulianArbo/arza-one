import { secondFactorStatusResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { SecondFactorResetUseCase } from '../../../src/modules/iam/application/second-factor-reset.js';
import { totpCodeAt } from '../../../src/modules/iam/infrastructure/totp.js';
import {
  GOOD_PASSWORD,
  MINUTE,
  accountEmailJobs,
  auditActions,
  currentCode,
  errorCode,
  postWithSession,
  profileOf,
  signIn,
  signInWithPassword,
  uniqueEmail,
  type SignedIn,
} from './support/iam-fixtures.js';
import { IamScenario } from './support/iam-scenario.js';

// Acciones de alto riesgo (numeral 15.1, B09): piden confirmar la identidad en los últimos 30
// minutos. Cambiar de celular, desactivar el segundo factor y su reinicio por el responsable.

const scenario = new IamScenario('alto riesgo');

function reauthenticate(signedIn: SignedIn, body: object) {
  return postWithSession(scenario.app, '/v1/auth/reauthenticate', signedIn, body);
}

function regenerateCodes(signedIn: SignedIn) {
  return postWithSession(scenario.app, '/v1/me/mfa/recovery-codes', signedIn);
}

describe('confirmar que es usted antes de una acción de alto riesgo', () => {
  it('pasados 30 minutos, generar códigos nuevos exige confirmar la identidad', async () => {
    const { email } = await scenario.newUser('treinta');
    const signedIn = await signIn(scenario.app, email);
    scenario.clock.advance(31 * MINUTE);
    const stale = await regenerateCodes(signedIn);
    expect(stale.status).toBe(403);
    expect(errorCode(stale)).toBe('REAUTHENTICATION_REQUIRED');
    const code = currentCode(email, scenario.clock);
    expect((await reauthenticate(signedIn, { password: GOOD_PASSWORD, code })).status).toBe(204);
    expect((await regenerateCodes(signedIn)).status).toBe(200);
  });

  it('con segundo factor, la contraseña sola no basta', async () => {
    const { email } = await scenario.newUser('sin-codigo-reauth');
    const signedIn = await signIn(scenario.app, email);
    const response = await reauthenticate(signedIn, { password: GOOD_PASSWORD });
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('REAUTHENTICATION_FAILED');
  });

  it('una contraseña equivocada no gasta el código', async () => {
    const { email } = await scenario.newUser('no-gasta');
    const signedIn = await signIn(scenario.app, email);
    scenario.nextCodePeriod();
    const code = currentCode(email, scenario.clock);
    const wrong = await reauthenticate(signedIn, { password: 'otra frase equivocada', code });
    expect(wrong.status).toBe(422);
    expect((await reauthenticate(signedIn, { password: GOOD_PASSWORD, code })).status).toBe(204);
  });

  it('una sesión a medias no puede hacer acciones de alto riesgo', async () => {
    const { email } = await scenario.newUser('medias');
    const pending = await signInWithPassword(scenario.app, email);
    const response = await regenerateCodes(pending);
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('SECOND_FACTOR_REQUIRED');
  });
});

describe('fallos al confirmar la identidad', () => {
  it('el quinto cierra la sesión y queda en la auditoría', async () => {
    const { email, id } = await scenario.newUser('cinco-reauth');
    const signedIn = await signIn(scenario.app, email);
    const wrong = { password: 'frase equivocada' };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await reauthenticate(signedIn, wrong)).status).toBe(422);
    }
    expect(errorCode(await reauthenticate(signedIn, wrong))).toBe('ACCOUNT_LOCKED');
    expect(await profileOf(scenario.app, signedIn.cookie)).toBeNull();
    const session = await scenario.inTenant((tx) =>
      tx.session.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(await auditActions(scenario.db, scenario.tenant.id, session.id)).toContain(
      'iam.session.reauthenticate:failure',
    );
  });
});

describe('cambiar de celular', () => {
  it('el secreto anterior deja de servir y se cierran las demás sesiones', async () => {
    const { email, id } = await scenario.newUser('nuevo-celular');
    const current = await signIn(scenario.app, email);
    const other = await signIn(scenario.app, email);
    const setup = await scenario.startSetup(current);
    const confirm = await postWithSession(scenario.app, '/v1/auth/mfa/setup/confirm', current, {
      code: totpCodeAt(setup.secret, scenario.clock.now()),
    });
    expect(confirm.status).toBe(200);
    expect(await profileOf(scenario.app, other.cookie)).toBeNull();
    expect(await profileOf(scenario.app, current.cookie)).not.toBeNull();
    scenario.nextCodePeriod();
    const pending = await signInWithPassword(scenario.app, email);
    const verify = (code: string) =>
      postWithSession(scenario.app, '/v1/auth/mfa/verify', pending, { code });
    expect((await verify(currentCode(email, scenario.clock))).status).toBe(422);
    expect((await verify(totpCodeAt(setup.secret, scenario.clock.now()))).status).toBe(200);
    expect(await accountEmailJobs(id, 'mfa_changed')).toHaveLength(1);
  });
});

describe('desactivar el segundo factor', () => {
  it('un usuario interno no puede desactivarlo', async () => {
    const signedIn = await signIn(scenario.app, (await scenario.newUser('obligado')).email);
    const response = await postWithSession(scenario.app, '/v1/me/mfa/disable', signedIn);
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('SECOND_FACTOR_MANDATORY');
    const status = await scenario.get('/v1/me/mfa', signedIn);
    expect(secondFactorStatusResponseSchema.parse(status.body)).toMatchObject({
      required: true,
      enabled: true,
    });
  });

  it('quien lo tiene por elección puede desactivarlo: cierra sus demás sesiones y avisa', async () => {
    const { email, id } = await scenario.newUser('opcional', {
      kind: 'portal',
      withSecondFactor: true,
    });
    const current = await signIn(scenario.app, email);
    const other = await signIn(scenario.app, email);
    expect((await postWithSession(scenario.app, '/v1/me/mfa/disable', current)).status).toBe(204);
    expect(await profileOf(scenario.app, other.cookie)).toBeNull();
    expect((await signInWithPassword(scenario.app, email)).session.stage).toBe('complete');
    const factor = await scenario.inTenant((tx) =>
      tx.mfaFactor.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(factor.secretEncrypted).toBeNull();
    const actions = await auditActions(scenario.db, scenario.tenant.id, factor.id);
    expect(actions).toContain('iam.mfa.disable:success');
    expect(await accountEmailJobs(id, 'mfa_disabled')).toHaveLength(1);
  });
});

describe('reinicio del segundo factor por el responsable técnico', () => {
  it('cierra todas las sesiones, deja auditoría y obliga a configurarlo de nuevo', async () => {
    const { email, id } = await scenario.newUser('perdio-celular');
    const signedIn = await signIn(scenario.app, email);
    const result = await scenario.app.get(SecondFactorResetUseCase).execute(email);
    expect(result).toEqual({ userId: id, sessionsClosed: 1 });
    expect(await profileOf(scenario.app, signedIn.cookie)).toBeNull();
    const pending = await signInWithPassword(scenario.app, email);
    expect(pending.session.stage).toBe('second_factor_setup');
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toContain(
      'iam.user.reset_mfa:success',
    );
    const events = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { userId: id, type: 'iam.mfa.reset' } }),
    );
    expect(events.map((event) => event.severity)).toEqual(['high']);
    expect(await accountEmailJobs(id, 'mfa_reset')).toHaveLength(1);
  });

  it('un correo sin cuenta no cambia nada', async () => {
    const reset = scenario.app.get(SecondFactorResetUseCase);
    expect(await reset.execute(uniqueEmail('nadie'))).toBeNull();
  });
});
