import { secondFactorConfirmResponseSchema, sessionResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { totpCodeAt } from '../../../src/modules/iam/infrastructure/totp.js';
import { FieldCipher } from '../../../src/platform/crypto/field-cipher.js';
import { testEnv } from '../../support/test-env.js';
import {
  MINUTE,
  SESSION_COOKIE,
  accountEmailJobs,
  auditActions,
  cookieValue,
  errorCode,
  factorContext,
  postWithSession,
  profileOf,
  signInWithPassword,
} from './support/iam-fixtures.js';
import { IamScenario } from './support/iam-scenario.js';

// Configuración del segundo factor (numeral 15.1, B09): un usuario interno sin él no pasa de la
// pantalla de configuración (criterio 1) y el secreto se guarda cifrado (criterio 2).

const scenario = new IamScenario('configuracion');
const cipher = new FieldCipher(testEnv()['FIELD_ENCRYPTION_KEY'] ?? '');

async function pendingWithoutFactor(label: string) {
  const user = await scenario.newUser(label, { withSecondFactor: false });
  return { ...user, pending: await signInWithPassword(scenario.app, user.email) };
}

describe('un usuario interno sin segundo factor no pasa de la configuración (criterio 1)', () => {
  it('la contraseña correcta solo abre una sesión que pide configurarlo', async () => {
    const { pending } = await pendingWithoutFactor('sin-factor');
    expect(pending.session.stage).toBe('second_factor_setup');
    const current = await scenario.get('/v1/auth/session', pending);
    expect(sessionResponseSchema.parse(current.body).stage).toBe('second_factor_setup');
  });

  it.each(['/v1/me', '/v1/me/sessions', '/v1/me/mfa'])(
    'esa sesión recibe 403 en %s (permiso denegado)',
    async (path) => {
      const { pending } = await pendingWithoutFactor('bloqueado');
      const response = await scenario.get(path, pending);
      expect(response.status).toBe(403);
      expect(errorCode(response)).toBe('SECOND_FACTOR_REQUIRED');
    },
  );

  it('tampoco puede cambiar la contraseña ni confirmar su identidad', async () => {
    const { pending } = await pendingWithoutFactor('sin-cambios');
    const change = await postWithSession(scenario.app, '/v1/me/password', pending, {
      current_password: 'x',
      new_password: 'y',
    });
    const reauth = await postWithSession(scenario.app, '/v1/auth/reauthenticate', pending, {
      password: 'x',
    });
    expect([change.status, reauth.status]).toEqual([403, 403]);
  });
});

describe('la sesión a medias', () => {
  it('vence a los 10 minutos', async () => {
    const { pending } = await pendingWithoutFactor('vence');
    scenario.clock.advance(10 * MINUTE);
    expect((await scenario.get('/v1/auth/session', pending)).status).toBe(401);
  });

  it('sin el código antifalsificación no puede configurar', async () => {
    const { pending } = await pendingWithoutFactor('sin-csrf');
    const response = await request(scenario.app.getHttpServer())
      .post('/v1/auth/mfa/setup')
      .set('Cookie', pending.cookie)
      .send({});
    expect(response.status).toBe(403);
    expect(errorCode(response)).toBe('CSRF_INVALID');
  });
});

describe('configurar el segundo factor al iniciar sesión', () => {
  it('con el primer código la sesión se completa, con llave nueva y diez códigos', async () => {
    const { id, pending } = await pendingWithoutFactor('configura');
    const setup = await scenario.startSetup(pending);
    expect(setup.otpauth_uri).toContain('otpauth://totp/ARZA%20ONE:');
    const code = totpCodeAt(setup.secret, scenario.clock.now());
    const response = await postWithSession(scenario.app, '/v1/auth/mfa/setup/confirm', pending, {
      code,
    });
    const confirmed = secondFactorConfirmResponseSchema.parse(response.body);
    expect(confirmed.recovery_codes).toHaveLength(10);
    expect(confirmed.session.stage).toBe('complete');
    const token = cookieValue(response.headers['set-cookie'], SESSION_COOKIE);
    expect(token).not.toBeNull();
    expect(token).not.toBe(pending.token);
    expect(await profileOf(scenario.app, pending.cookie)).toBeNull();
    expect((await profileOf(scenario.app, `${SESSION_COOKIE}=${token ?? ''}`))?.id).toBe(id);
  });

  it('un código equivocado no activa nada', async () => {
    const { id, pending } = await pendingWithoutFactor('equivocado');
    await scenario.startSetup(pending);
    const response = await postWithSession(scenario.app, '/v1/auth/mfa/setup/confirm', pending, {
      code: '000000',
    });
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('SECOND_FACTOR_CODE_INVALID');
    const factor = await scenario.inTenant((tx) =>
      tx.mfaFactor.findFirst({ where: { userId: id } }),
    );
    expect(factor?.confirmedAt).toBeNull();
  });
});

describe('vencimiento y registro de la configuración', () => {
  it('la configuración vence a los 15 minutos', async () => {
    const { email, pending: first } = await pendingWithoutFactor('tarde');
    const setup = await scenario.startSetup(first);
    scenario.clock.advance(9 * MINUTE);
    const second = await signInWithPassword(scenario.app, email);
    scenario.clock.advance(6 * MINUTE);
    const code = totpCodeAt(setup.secret, scenario.clock.now());
    const response = await postWithSession(scenario.app, '/v1/auth/mfa/setup/confirm', second, {
      code,
    });
    expect(response.status).toBe(422);
    expect(errorCode(response)).toBe('SECOND_FACTOR_SETUP_EXPIRED');
  });

  it('deja auditoría, el evento de seguridad y el aviso por correo', async () => {
    const { id } = await scenario.configuredUser('registro');
    const factor = await scenario.inTenant((tx) =>
      tx.mfaFactor.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(await auditActions(scenario.db, scenario.tenant.id, factor.id)).toEqual([
      'iam.mfa.setup_start:success',
      'iam.mfa.enable:success',
    ]);
    const events = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { userId: id } }),
    );
    expect(events.map((event) => event.type)).toContain('iam.mfa.enabled');
    expect(await accountEmailJobs(id, 'mfa_enabled')).toHaveLength(1);
  });
});

describe('el secreto TOTP se guarda cifrado (criterio 2)', () => {
  it('el secreto en configuración no se lee en la base y solo descifra con la llave', async () => {
    const { id, pending } = await pendingWithoutFactor('cifrado-pendiente');
    const setup = await scenario.startSetup(pending);
    const stored = await scenario.inTenant((tx) =>
      tx.mfaFactor.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(stored.pendingSecretEncrypted).not.toContain(setup.secret);
    const context = factorContext(scenario.tenant.id, id);
    expect(cipher.decrypt(stored.pendingSecretEncrypted ?? '', context)).toBe(setup.secret);
  });

  it('el secreto activo tampoco, y no descifra con el contexto de otra persona', async () => {
    const { id, secret } = await scenario.configuredUser('cifrado-activo');
    const active = await scenario.inTenant((tx) =>
      tx.mfaFactor.findFirstOrThrow({ where: { userId: id } }),
    );
    expect(active.secretEncrypted).toMatch(/^v1\./);
    expect(active.secretEncrypted).not.toContain(secret);
    const stored = active.secretEncrypted ?? '';
    expect(cipher.decrypt(stored, factorContext(scenario.tenant.id, id))).toBe(secret);
    expect(() => cipher.decrypt(stored, factorContext(scenario.otherTenant.id, id))).toThrow();
    expect(active.pendingSecretEncrypted).toBeNull();
  });
});

describe('lo que la base guarda de los códigos y del secreto (criterio 2)', () => {
  it('de los códigos de recuperación solo queda la huella', async () => {
    const { id, recoveryCodes } = await scenario.configuredUser('huellas');
    const rows = await scenario.inTenant((tx) =>
      tx.recoveryCode.findMany({ where: { userId: id } }),
    );
    expect(rows).toHaveLength(10);
    const hashes = rows.map((row) => row.codeHash).join(' ');
    for (const code of recoveryCodes) expect(hashes).not.toContain(code.replaceAll('-', ''));
  });

  it('la base rechaza un secreto escrito sin cifrar', async () => {
    const { id } = await scenario.newUser('plano', { withSecondFactor: false });
    const data = {
      tenantId: scenario.tenant.id,
      userId: id,
      secretEncrypted: 'JBSWY3DPEHPK3PXP',
      confirmedAt: new Date(),
    };
    await expect(scenario.inTenant((tx) => tx.mfaFactor.create({ data }))).rejects.toThrow();
  });
});
