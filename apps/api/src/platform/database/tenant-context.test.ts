import { describe, expect, it } from 'vitest';

import { DatabaseService } from './database.service.js';
import {
  applyTenantContext,
  parseTenantContext,
  type TenantTransaction,
} from './tenant-context.js';

const TENANT_ID = '01999a00-0000-7000-8000-000000000001';
const USER_ID = '01999a00-0000-7000-8000-000000000002';

/** Transacción de ensayo que guarda la consulta recibida en lugar de enviarla. */
function recordingTransaction(): { transaction: TenantTransaction; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const executeRaw = (...args: unknown[]): Promise<number> => {
    calls.push(args);
    return Promise.resolve(1);
  };
  return { transaction: { $executeRaw: executeRaw } as unknown as TenantTransaction, calls };
}

describe('parseTenantContext', () => {
  it('acepta empresa y usuario UUID, o usuario null para procesos del sistema', () => {
    expect(parseTenantContext({ tenantId: TENANT_ID, userId: USER_ID })).toEqual({
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(parseTenantContext({ tenantId: TENANT_ID, userId: null }).userId).toBeNull();
  });

  it.each([
    ['empresa vacía', { tenantId: '', userId: null }],
    ['empresa con SQL', { tenantId: "' OR 1=1 --", userId: null }],
    ['usuario inválido', { tenantId: TENANT_ID, userId: 'admin' }],
  ])('rechaza %s', (_description, context) => {
    expect(() => parseTenantContext(context)).toThrow('El contexto de empresa no es válido.');
  });
});

describe('applyTenantContext', () => {
  it('envía la empresa y el usuario como parámetros, nunca dentro del texto SQL', async () => {
    const { transaction, calls } = recordingTransaction();
    await applyTenantContext(transaction, { tenantId: TENANT_ID, userId: USER_ID });
    const [strings, ...values] = calls[0] ?? [];
    expect((strings as string[]).join('?')).toBe(
      "SELECT set_config('app.tenant_id', ?, true), set_config('app.user_id', ?, true)",
    );
    expect(values).toEqual([TENANT_ID, USER_ID]);
  });

  it('sin usuario fija el valor vacío, que la base de datos interpreta como «ninguno»', async () => {
    const { transaction, calls } = recordingTransaction();
    await applyTenantContext(transaction, { tenantId: TENANT_ID, userId: null });
    expect(calls[0]?.slice(1)).toEqual([TENANT_ID, '']);
  });
});

describe('DatabaseService.withTenant', () => {
  it('rechaza un contexto inválido sin abrir conexión', async () => {
    const database = new DatabaseService('postgresql://app_user:ficticia@127.0.0.1:1/arza_one');
    const work = database.withTenant({ tenantId: 'x', userId: null }, () => Promise.resolve());
    await expect(work).rejects.toThrow('El contexto de empresa no es válido.');
    await database.onModuleDestroy();
  });
});
