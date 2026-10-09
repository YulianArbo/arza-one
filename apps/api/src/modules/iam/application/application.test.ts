import { describe, expect, it, vi } from 'vitest';

import type { JobQueue } from '../../../platform/queues/job-queue.js';
import { AccountNotifier } from './account-notifier.js';
import { bogotaDateTime, greeting } from './email-format.js';
import {
  accountLocked,
  loginDelayed,
  reauthenticationFailed,
  reauthenticationRequired,
  secondFactorAlreadyConfigured,
  secondFactorCodeInvalid,
  secondFactorMandatory,
  secondFactorNotConfigured,
  secondFactorSetupExpired,
  sessionNotFound,
  signInAlreadyComplete,
} from './iam-messages.js';
import { PasswordSetter } from './password-setter.js';

const REQUEST = {
  tenantId: '01999a00-0000-7000-8000-0000000000d1',
  actorId: null,
  accountUserId: '01999a00-0000-7000-8000-00000000a001',
  purpose: 'password_reset',
  correlationId: '01999a00-0000-7000-8000-00000000c001',
} as const;

function notifierWith(add: JobQueue['add']): AccountNotifier {
  return new AccountNotifier({ add } as unknown as JobQueue);
}

describe('pedido de correos de la cuenta', () => {
  it('encola el trabajo solo con identificadores y el propósito', async () => {
    const add = vi.fn<JobQueue['add']>().mockResolvedValue('1');
    await expect(notifierWith(add).request(REQUEST)).resolves.toBe(true);
    expect(add.mock.calls[0]?.[1]).toEqual({
      tenantId: REQUEST.tenantId,
      userId: null,
      accountUserId: REQUEST.accountUserId,
      purpose: 'password_reset',
      correlationId: REQUEST.correlationId,
    });
  });

  it('si la cola no responde, no falla: la respuesta a la persona no cambia', async () => {
    const add = vi.fn<JobQueue['add']>().mockRejectedValue(new Error('Valkey caído'));
    await expect(notifierWith(add).request({ ...REQUEST, correlationId: null })).resolves.toBe(
      false,
    );
  });
});

describe('mensajes de espera y bloqueo', () => {
  it('usan singular y plural en español', () => {
    expect(loginDelayed(1).message).toContain('espere 1 segundo antes');
    expect(loginDelayed(4).message).toContain('espere 4 segundos antes');
    expect(accountLocked(60).message).toContain('en 1 minuto');
    expect(accountLocked(900).message).toContain('en 15 minutos');
    expect(accountLocked(900).retryAfterSeconds).toBe(900);
  });
});

describe('contraseña nueva', () => {
  const setter = new PasswordSetter();

  it('calcula la huella de una contraseña válida', async () => {
    await expect(setter.hashNew('una frase larga y propia')).resolves.toMatch(/^\$argon2id\$/);
  });

  it('rechaza con un mensaje claro las cortas, las largas y las filtradas', async () => {
    await expect(setter.hashNew('corta')).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
    await expect(setter.hashNew('x'.repeat(129))).rejects.toMatchObject({
      code: 'PASSWORD_TOO_LONG',
    });
    await expect(setter.hashNew('123456789012')).rejects.toMatchObject({
      code: 'PASSWORD_BREACHED',
      status: 422,
    });
  });
});

describe('mensajes del segundo factor (B09)', () => {
  it.each([
    [secondFactorCodeInvalid, 422, 'SECOND_FACTOR_CODE_INVALID'],
    [reauthenticationFailed, 422, 'REAUTHENTICATION_FAILED'],
    [signInAlreadyComplete, 409, 'SIGN_IN_ALREADY_COMPLETE'],
    [secondFactorNotConfigured, 409, 'SECOND_FACTOR_NOT_CONFIGURED'],
    [secondFactorAlreadyConfigured, 409, 'SECOND_FACTOR_ALREADY_CONFIGURED'],
    [secondFactorSetupExpired, 422, 'SECOND_FACTOR_SETUP_EXPIRED'],
    [secondFactorMandatory, 422, 'SECOND_FACTOR_MANDATORY'],
    [sessionNotFound, 404, 'SESSION_NOT_FOUND'],
    [reauthenticationRequired, 403, 'REAUTHENTICATION_REQUIRED'],
  ])('%o responde con su estado y código estable, en español', (build, status, code) => {
    const error = build();
    expect({ status: error.status, code: error.code }).toEqual({ status, code });
    expect(error.message).toMatch(/^[A-ZÁÉÍÓÚÑ¿]/);
  });
});

describe('formato de los correos', () => {
  const user = { displayName: 'Ana Pérez' } as Parameters<typeof greeting>[0];

  it('saluda por el nombre, o sin nombre si no lo tiene', () => {
    expect(greeting(user)).toBe('Hola, Ana Pérez:');
    expect(greeting({ ...user, displayName: null })).toBe('Hola:');
  });

  it('muestra fechas dd/mm/aaaa en hora de Colombia', () => {
    expect(bogotaDateTime(new Date('2026-10-09T20:30:00Z'))).toBe('09/10/2026, 3:30 p. m.');
  });
});
