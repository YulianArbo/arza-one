import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { TenantContext } from '../../src/platform/database/tenant-context.js';
import {
  connect,
  createDatabaseService,
  createTenant,
  integrationDatabase,
  newTestTenant,
} from './support/integration-database.js';

// Aislamiento entre empresas (ADR-007, numeral 15.4): la base de datos lo impide aunque el
// código se equivoque. Por eso las consultas de estas pruebas no filtran por empresa.

const tenantA = newTestTenant('A');
const tenantB = newTestTenant('B');
const asA: TenantContext = { tenantId: tenantA.id, userId: null };
let database: DatabaseService;

async function addEvent(context: TenantContext, eventType: string): Promise<string> {
  const event = await database.withTenant(context, (transaction) =>
    transaction.outboxEvent.create({
      data: { tenantId: context.tenantId, eventType, payload: { origin: 'prueba' } },
    }),
  );
  return event.id;
}

beforeAll(async () => {
  database = createDatabaseService();
  await createTenant(database, tenantA);
  await createTenant(database, tenantB);
  await addEvent(asA, 'test.event.a');
  await addEvent({ tenantId: tenantB.id, userId: null }, 'test.event.b');
});

afterAll(async () => {
  await database.onModuleDestroy();
});

describe('sin contexto de empresa', () => {
  it('una consulta no devuelve filas aunque existan', async () => {
    const client = await connect(integrationDatabase().appUrl);
    try {
      const tenants = await client.query('SELECT id FROM core_tenants');
      const events = await client.query('SELECT id FROM core_outbox_events');
      expect(tenants.rowCount).toBe(0);
      expect(events.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('no se puede escribir', async () => {
    const client = await connect(integrationDatabase().appUrl);
    try {
      const insert = client.query(
        'INSERT INTO core_tenants (id, legal_name, tax_id) VALUES ($1, $2, $3)',
        [newTestTenant('sin contexto').id, 'Sin contexto', 'T-sin-contexto'],
      );
      await expect(insert).rejects.toThrow(/row-level security/);
    } finally {
      await client.end();
    }
  });
});

describe('con el contexto de la empresa A', () => {
  it('solo ve su empresa y sus eventos', async () => {
    const visible = await database.withTenant(asA, async (transaction) => ({
      tenants: await transaction.tenant.findMany(),
      events: await transaction.outboxEvent.findMany(),
    }));
    expect(visible.tenants.map((tenant) => tenant.id)).toEqual([tenantA.id]);
    expect(visible.events.map((event) => event.eventType)).toEqual(['test.event.a']);
  });

  it('no encuentra la empresa B ni buscándola por su identificador', async () => {
    const found = await database.withTenant(asA, (transaction) =>
      transaction.tenant.findUnique({ where: { id: tenantB.id } }),
    );
    expect(found).toBeNull();
  });

  it('no puede modificar filas de la empresa B', async () => {
    const result = await database.withTenant(asA, (transaction) =>
      transaction.tenant.updateMany({ where: { id: tenantB.id }, data: { legalName: 'Robada' } }),
    );
    expect(result.count).toBe(0);
  });

  it('no puede crear filas a nombre de la empresa B', async () => {
    const write = database.withTenant(asA, (transaction) =>
      transaction.outboxEvent.create({
        data: { tenantId: tenantB.id, eventType: 'test.intrusion', payload: {} },
      }),
    );
    await expect(write).rejects.toThrow();
  });

  it('no puede pasar una de sus filas a la empresa B', async () => {
    const eventId = await addEvent(asA, 'test.move');
    const move = database.withTenant(asA, (transaction) =>
      transaction.outboxEvent.update({ where: { id: eventId }, data: { tenantId: tenantB.id } }),
    );
    await expect(move).rejects.toThrow();
  });
});

describe('vigencia del contexto', () => {
  it('termina con la transacción: la conexión reutilizada no conserva la empresa', async () => {
    const client = await connect(integrationDatabase().appUrl);
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA.id]);
      const inside = await client.query('SELECT id FROM core_tenants');
      await client.query('COMMIT');
      const after = await client.query('SELECT id FROM core_tenants');
      expect(inside.rowCount).toBe(1);
      expect(after.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('un contexto con identificadores inválidos se rechaza antes de llegar a la base de datos', async () => {
    const invalid = database.withTenant({ tenantId: "' OR 1=1 --", userId: null }, (transaction) =>
      transaction.tenant.findMany(),
    );
    await expect(invalid).rejects.toThrow('El contexto de empresa no es válido.');
  });
});
