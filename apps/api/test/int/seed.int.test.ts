import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import { DEMO_TENANTS, PLATFORM_TENANT } from '../../src/platform/database/seed/seed-data.js';
import { seedDemo, seedPlatform } from '../../src/platform/database/seed/seed.js';
import { createDatabaseService } from './support/integration-database.js';

// Datos semilla idempotentes (capítulo 12.1): ejecutarlos varias veces deja lo mismo.

let database: DatabaseService;

function snapshot(tenantId: string) {
  return database.withTenant({ tenantId, userId: null }, async (transaction) => ({
    tenants: await transaction.tenant.findMany(),
    events: await transaction.outboxEvent.findMany(),
  }));
}

beforeAll(() => {
  database = createDatabaseService();
});

afterAll(async () => {
  await database.onModuleDestroy();
});

describe('datos semilla', () => {
  it('crean la empresa de la plataforma y repetirlos no cambia nada', async () => {
    await seedPlatform(database);
    const first = await snapshot(PLATFORM_TENANT.id);
    await seedPlatform(database);
    const second = await snapshot(PLATFORM_TENANT.id);

    expect(first.tenants).toHaveLength(1);
    expect(first.tenants[0]).toMatchObject({ ...PLATFORM_TENANT, version: 1 });
    expect(second).toEqual(first);
  });

  it('los datos ficticios crean dos empresas aisladas, una vez', async () => {
    await seedDemo(database);
    await seedDemo(database);
    for (const tenant of DEMO_TENANTS) {
      const visible = await snapshot(tenant.id);
      expect(visible.tenants.map((row) => row.id)).toEqual([tenant.id]);
      expect(visible.events).toHaveLength(1);
      expect(visible.events[0]?.tenantId).toBe(tenant.id);
    }
  });
});
