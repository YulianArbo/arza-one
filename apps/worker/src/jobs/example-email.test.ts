import type { TenantContext } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import type { MailMessage } from '../mail/mailer.js';
import { processExampleEmail, type ExampleEmailDependencies } from './example-email.js';

interface FakeTenant {
  readonly legalName: string;
  readonly tradeName: string | null;
}

type WithTenant = ExampleEmailDependencies['database']['withTenant'];

/**
 * Base de datos simulada: como la seguridad por fila, solo deja ver la empresa del contexto.
 * Registra cada contexto recibido.
 */
function fakeWithTenant(tenants: Record<string, FakeTenant>, contexts: TenantContext[]) {
  const withTenant = async (
    context: TenantContext,
    work: (transaction: never) => Promise<unknown>,
  ) => {
    contexts.push(context);
    const visible = (id: string): FakeTenant | null =>
      id === context.tenantId ? (tenants[id] ?? null) : null;
    const transaction = {
      tenant: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          Promise.resolve(visible(where.id)),
      },
    };
    return await work(transaction as never);
  };
  // La firma genérica de withTenant no se puede reproducir en un doble de prueba.
  return withTenant as unknown as WithTenant;
}

function setup(tenants: Record<string, FakeTenant>, mailFails = false) {
  const contexts: TenantContext[] = [];
  const sent: MailMessage[] = [];
  const deps: ExampleEmailDependencies = {
    database: { withTenant: fakeWithTenant(tenants, contexts) },
    mailer: {
      send: async (message) => {
        if (mailFails) throw new Error('SMTP sin respuesta');
        sent.push(message);
        return Promise.resolve();
      },
    },
  };
  return { contexts, sent, deps };
}

const tenantId = uuidv7();
const jobData = {
  tenantId,
  userId: null,
  correlationId: uuidv7(),
  recipient: 'pruebas@arza-one.test',
};
const UNO = { [tenantId]: { legalName: 'Uno S.A.S.', tradeName: 'Uno' } };

describe('trabajo de ejemplo: correo de prueba', () => {
  it('lee la empresa en su propio contexto y envía el correo con su nombre', async () => {
    const { contexts, sent, deps } = setup(UNO);
    await processExampleEmail(jobData, deps);
    expect(contexts).toEqual([{ tenantId, userId: null }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('pruebas@arza-one.test');
    expect(sent[0]?.subject).toBe('Correo de prueba de ARZA ONE para Uno');
    expect(sent[0]?.text).toContain(jobData.correlationId);
  });

  it('usa la razón social si la empresa no tiene nombre comercial', async () => {
    const { sent, deps } = setup({ [tenantId]: { legalName: 'Uno S.A.S.', tradeName: null } });
    await processExampleEmail(jobData, deps);
    expect(sent[0]?.subject).toContain('Uno S.A.S.');
  });

  it('si el correo falla, el error sube para que BullMQ lo reintente', async () => {
    const { deps } = setup(UNO, true);
    const failure = processExampleEmail(jobData, deps);
    await expect(failure).rejects.toThrow('SMTP sin respuesta');
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError);
  });
});

describe('trabajo de ejemplo: casos que no se reintentan', () => {
  it('datos inválidos: no consulta nada ni envía correo', async () => {
    const { contexts, sent, deps } = setup(UNO);
    const invalid = { ...jobData, tenantId: 'otra-empresa', recipient: 'sin-arroba' };
    await expect(processExampleEmail(invalid, deps)).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processExampleEmail(null, deps)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(contexts).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('una empresa que no existe o que no es la del contexto no se ve: no envía nada', async () => {
    const { sent, deps } = setup({ [uuidv7()]: { legalName: 'Otra S.A.S.', tradeName: 'Otra' } });
    await expect(processExampleEmail(jobData, deps)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(sent).toEqual([]);
  });
});
