import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import {
  createDatabaseService,
  createTenant,
  newTestTenant,
} from './support/integration-database.js';

// Un caso de uso es una transacción (capítulo 11.2): el dato y sus eventos de la bandeja de
// salida se guardan juntos o no se guarda nada. La auditoría (B11) se apoya en esta garantía.

const tenant = newTestTenant('transacción');
const context = { tenantId: tenant.id, userId: null };
let database: DatabaseService;

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenant);
});

afterAll(async () => {
  await database.onModuleDestroy();
});

describe('transacción con contexto de empresa', () => {
  it('si algo falla, no queda ni el cambio ni el evento', async () => {
    const failingUseCase = database.withTenant(context, async (transaction) => {
      await transaction.tenant.update({ where: { id: tenant.id }, data: { tradeName: 'Nuevo' } });
      await transaction.outboxEvent.create({
        data: { tenantId: tenant.id, eventType: 'tenant.renamed', payload: {} },
      });
      throw new Error('Falla simulada del caso de uso');
    });
    await expect(failingUseCase).rejects.toThrow('Falla simulada del caso de uso');

    const state = await database.withTenant(context, async (transaction) => ({
      tenant: await transaction.tenant.findUniqueOrThrow({ where: { id: tenant.id } }),
      events: await transaction.outboxEvent.count(),
    }));
    expect(state.tenant.tradeName).toBeNull();
    expect(state.tenant.version).toBe(1);
    expect(state.events).toBe(0);
  });

  it('si todo sale bien, el cambio y el evento quedan guardados juntos', async () => {
    await database.withTenant(context, async (transaction) => {
      await transaction.tenant.update({ where: { id: tenant.id }, data: { tradeName: 'Nuevo' } });
      await transaction.outboxEvent.create({
        data: { tenantId: tenant.id, eventType: 'tenant.renamed', payload: {} },
      });
    });
    const events = await database.withTenant(context, (transaction) =>
      transaction.outboxEvent.findMany({ where: { eventType: 'tenant.renamed' } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.publishedAt).toBeNull();
    expect(events[0]?.attempts).toBe(0);
  });
});
