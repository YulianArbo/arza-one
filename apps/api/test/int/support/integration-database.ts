import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { DatabaseService } from '../../../src/platform/database/database.service.js';

/** Direcciones de la base de datos desechable que levanta global-setup.ts. */
export interface IntegrationDatabase {
  /** app_user: el usuario con el que trabaja la API. */
  readonly appUrl: string;
  /** migration_user: dueño del esquema; aplica las migraciones. */
  readonly migrationUrl: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    database: IntegrationDatabase;
    /** Valkey desechable, con contraseña. */
    valkeyUrl: string;
  }
}

export function integrationDatabase(): IntegrationDatabase {
  return inject('database');
}

/** Conexión de la API, como en producción. */
export function createDatabaseService(): DatabaseService {
  return new DatabaseService(integrationDatabase().appUrl);
}

/** Conexión directa con SQL, para comprobar lo que la base de datos permite o rechaza. */
export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

export interface TestTenant {
  readonly id: string;
  readonly legalName: string;
  readonly taxId: string;
}

/** Empresa ficticia con identificadores únicos, para que las pruebas no choquen entre sí. */
export function newTestTenant(label: string): TestTenant {
  const id = uuidv7();
  return { id, legalName: `Empresa de prueba ${label}`, taxId: `T-${id}` };
}

/** Crea la empresa dentro de su propio contexto, como lo harían los datos semilla. */
export async function createTenant(database: DatabaseService, tenant: TestTenant): Promise<void> {
  await database.withTenant({ tenantId: tenant.id, userId: null }, (transaction) =>
    transaction.tenant.create({ data: tenant }),
  );
}
