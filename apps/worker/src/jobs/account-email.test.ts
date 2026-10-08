import type { AccountEmailJob, TenantContext } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import type { MailMessage } from '../mail/mailer.js';
import { processAccountEmail, type AccountEmailJobDependencies } from './account-email.js';

// El recorrido completo, con PostgreSQL y Mailpit reales, está en test/int/account-email.int.test.ts.

interface FakeUser {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly kind: string;
  readonly passwordChangedAt: Date | null;
}

type WithTenant = AccountEmailJobDependencies['database']['withTenant'];

/** Base de datos simulada: solo deja ver la cuenta si es de la empresa del contexto. */
function fakeDatabase(user: FakeUser | null, contexts: TenantContext[]) {
  const withTenant = async (
    context: TenantContext,
    work: (transaction: never) => Promise<unknown>,
  ) => {
    contexts.push(context);
    const visible = user?.tenantId === context.tenantId ? user : null;
    const transaction = {
      user: { findFirst: async () => Promise.resolve(visible) },
      token: {
        updateMany: async () => Promise.resolve({ count: 0 }),
        create: async () => Promise.resolve({ id: uuidv7() }),
      },
      auditEvent: { create: async () => Promise.resolve({}) },
    };
    return await work(transaction as never);
  };
  // La firma genérica de withTenant no se puede reproducir en un doble de prueba.
  return { withTenant: withTenant as unknown as WithTenant };
}

function invitedUser(tenantId: string): FakeUser {
  return {
    id: uuidv7(),
    tenantId,
    email: 'ana@demo-uno.test',
    displayName: null,
    status: 'invited',
    kind: 'internal',
    passwordChangedAt: null,
  };
}

function setup(user: FakeUser | null) {
  const contexts: TenantContext[] = [];
  const sent: MailMessage[] = [];
  const deps: AccountEmailJobDependencies = {
    database: fakeDatabase(user, contexts),
    clock: { now: () => new Date('2026-10-09T15:00:00Z') },
    appUrl: 'https://pruebas.arza.test/app',
    mailer: {
      send: async (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
  };
  return { deps, contexts, sent };
}

function jobFor(tenantId: string, accountUserId: string): AccountEmailJob {
  return { tenantId, userId: null, accountUserId, purpose: 'invitation', correlationId: uuidv7() };
}

describe('correo de una cuenta', () => {
  it('envía la invitación con el enlace al dominio de la aplicación', async () => {
    const tenantId = uuidv7();
    const user = invitedUser(tenantId);
    const { deps, contexts, sent } = setup(user);
    await expect(processAccountEmail(jobFor(tenantId, user.id), deps)).resolves.toBe(true);
    expect(contexts).toEqual([{ tenantId, userId: null }]);
    expect(sent[0]?.to).toBe('ana@demo-uno.test');
    expect(sent[0]?.text).toMatch(/https:\/\/pruebas\.arza\.test\/activar-cuenta#token=[\w-]{43}/);
    expect(sent[0]?.text).toContain('vence el 12/10/2026');
  });

  it('si la cuenta no es de la empresa del trabajo, no envía nada', async () => {
    const user = invitedUser(uuidv7());
    const { deps, sent } = setup(user);
    await expect(processAccountEmail(jobFor(uuidv7(), user.id), deps)).resolves.toBe(false);
    expect(sent).toEqual([]);
  });

  it('rechaza sin reintento un trabajo con datos inválidos', async () => {
    const { deps } = setup(null);
    const failure = processAccountEmail({ purpose: 'invitation' }, deps);
    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
