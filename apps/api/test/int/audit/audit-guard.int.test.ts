import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recordAuditEvent } from '../../../src/platform/audit/audit-recorder.js';
import { DatabaseService } from '../../../src/platform/database/database.service.js';
import {
  createDatabaseService,
  createTenant,
  integrationDatabase,
  newTestTenant,
} from '../support/integration-database.js';

// Toda escritura deja su evento de auditoría en la misma transacción (ficha 17.20, ADR-012): la
// conexión de la API revierte la transacción que escribe sin auditar.

const tenant = newTestTenant('exigencia de auditoría');
const context = { tenantId: tenant.id, userId: null };
let fixtures: DatabaseService;
let api: DatabaseService;

beforeAll(async () => {
  fixtures = createDatabaseService();
  api = new DatabaseService(integrationDatabase().appUrl);
  await createTenant(fixtures, tenant);
});

afterAll(async () => {
  await Promise.all([fixtures.onModuleDestroy(), api.onModuleDestroy()]);
});

function rename(tradeName: string) {
  return api.withTenant(context, (tx) =>
    tx.tenant.update({ where: { id: tenant.id }, data: { tradeName } }),
  );
}

async function tradeName(): Promise<string | null> {
  const row = await fixtures.withTenant(context, (tx) =>
    tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } }),
  );
  return row.tradeName;
}

describe('exigencia de auditoría en cada transacción', () => {
  it('una escritura sin evento de auditoría se revierte', async () => {
    await expect(rename('Sin auditar')).rejects.toThrow('sin registrar su evento de auditoría');
    expect(await tradeName()).not.toBe('Sin auditar');
  });

  it('una escritura con su evento queda guardada', async () => {
    await api.withTenant(context, async (tx) => {
      await tx.tenant.update({ where: { id: tenant.id }, data: { tradeName: 'Auditada' } });
      await recordAuditEvent(tx, {
        tenantId: tenant.id,
        occurredAt: new Date(),
        actor: { kind: 'system' },
        action: 'core.tenant.update',
        entityType: 'tenant',
        entityId: tenant.id,
        result: 'success',
        changes: { tradeName: { from: null, to: 'Auditada' } },
        meta: null,
      });
    });
    expect(await tradeName()).toBe('Auditada');
  });

  it('una consulta no necesita evento', async () => {
    await expect(
      api.withTenant(context, (tx) => tx.tenant.findUniqueOrThrow({ where: { id: tenant.id } })),
    ).resolves.toMatchObject({ id: tenant.id });
  });

  it('una escritura técnica declarada queda exenta', async () => {
    await api.withTenant(
      context,
      (tx) => tx.tenant.update({ where: { id: tenant.id }, data: { tradeName: 'Técnica' } }),
      'session_activity',
    );
    expect(await tradeName()).toBe('Técnica');
  });
});
