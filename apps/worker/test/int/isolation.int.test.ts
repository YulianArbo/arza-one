import { DatabaseService } from '@arza/api/platform';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processExampleEmail } from '../../src/jobs/example-email.js';
import type { MailMessage } from '../../src/mail/mailer.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// Aislamiento entre empresas y permisos del worker (ADR-007, numeral 13.2). El worker usa la
// misma conexión limitada que la API (app_user) y fija la empresa del trabajo en cada transacción.

const config = workerConfig(3);
let database: DatabaseService;
let tenantA: TestTenant;
let tenantB: TestTenant;
const sent: MailMessage[] = [];
const mailer = {
  send: async (message: MailMessage): Promise<void> => {
    sent.push(message);
    return Promise.resolve();
  },
};

function jobFor(tenantId: string): Record<string, unknown> {
  return {
    tenantId,
    userId: null,
    correlationId: '01999a00-0000-7000-8000-00000000c0de',
    recipient: 'pruebas@arza-one.test',
  };
}

beforeAll(async () => {
  // Prepara los datos de prueba directamente; el worker bajo prueba sí exige la auditoría.
  database = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  tenantA = await createTenant(database, 'Aislada A');
  tenantB = await createTenant(database, 'Aislada B');
});

afterAll(async () => {
  await database.onModuleDestroy();
});

describe('aislamiento entre empresas en los trabajos', () => {
  it('cada trabajo solo ve la empresa que trae', async () => {
    await processExampleEmail(jobFor(tenantA.id), { database, mailer });
    await processExampleEmail(jobFor(tenantB.id), { database, mailer });
    expect(sent.map((mail) => mail.subject)).toEqual([
      'Correo de prueba de ARZA ONE para Aislada A',
      'Correo de prueba de ARZA ONE para Aislada B',
    ]);
  });

  it('dentro del contexto de una empresa, la otra no existe para el worker', async () => {
    const visible = await database.withTenant({ tenantId: tenantA.id, userId: null }, (tx) =>
      tx.tenant.findMany(),
    );
    expect(visible.map((tenant) => tenant.id)).toEqual([tenantA.id]);
    const other = await database.withTenant({ tenantId: tenantA.id, userId: null }, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantB.id } }),
    );
    expect(other).toBeNull();
  });
});

describe('permisos de la conexión del worker', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: config.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('es el usuario limitado app_user, no un superusuario ni dueño de las tablas', async () => {
    const result = await client.query<{ user: string; superuser: boolean; bypass: boolean }>(
      'SELECT current_user AS "user", rolsuper AS superuser, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user',
    );
    expect(result.rows[0]).toEqual({ user: 'app_user', superuser: false, bypass: false });
  });

  it('sin empresa fijada no ve ninguna fila', async () => {
    const result = await client.query('SELECT id FROM core_tenants');
    expect(result.rowCount).toBe(0);
  });

  it('no puede borrar empresas', async () => {
    await expect(client.query('DELETE FROM core_tenants')).rejects.toThrow(/permission denied/);
  });
});
