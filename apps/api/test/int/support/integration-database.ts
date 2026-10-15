import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { seedAccessControl } from '../../../src/modules/iam/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { DatabaseService } from '../../../src/platform/database/database.service.js';
import type { TestAntivirus, TestStorage } from './file-services.js';

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
    /** Garage desechable con su depósito y su llave (B14). */
    storage: TestStorage;
    /** ClamAV con solo la firma de ensayo EICAR (B14). */
    antivirus: TestAntivirus;
  }
}

export function integrationDatabase(): IntegrationDatabase {
  return inject('database');
}

/**
 * Conexión de app_user para preparar y revisar datos de prueba directamente en las tablas: no exige
 * el evento de auditoría de cada transacción. El código de la aplicación nunca corre con ella.
 */
export function createDatabaseService(): DatabaseService {
  return new DatabaseService(integrationDatabase().appUrl, { requireAudit: false });
}

let applicationDatabase: DatabaseService | undefined;

/**
 * Conexión como la de la API, que exige el evento de auditoría de cada escritura (B11): con ella
 * corren en las pruebas los casos de uso, la semilla y los comandos.
 */
export function apiDatabase(): DatabaseService {
  applicationDatabase ??= new DatabaseService(integrationDatabase().appUrl);
  return applicationDatabase;
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

/**
 * Crea la empresa dentro de su propio contexto, como lo harían los datos semilla, con el catálogo
 * de permisos y los roles del sistema (B10).
 */
export async function createTenant(database: DatabaseService, tenant: TestTenant): Promise<void> {
  await database.withTenant({ tenantId: tenant.id, userId: null }, (transaction) =>
    transaction.tenant.create({ data: tenant }),
  );
  await seedAccessControl(apiDatabase(), [tenant.id], systemClock);
}
