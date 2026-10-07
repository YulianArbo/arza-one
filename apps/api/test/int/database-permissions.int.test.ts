import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, integrationDatabase } from './support/integration-database.js';

// Permiso denegado en la base de datos (capítulo 12.1): app_user, el usuario de la API, no es
// dueño de las tablas ni puede saltar o desactivar la seguridad por fila.

const BUSINESS_TABLES = ['core_tenants', 'core_outbox_events'];
let appUser: pg.Client;

beforeAll(async () => {
  appUser = await connect(integrationDatabase().appUrl);
});

afterAll(async () => {
  await appUser.end();
});

describe('atributos de app_user', () => {
  it('no es superusuario, no salta la seguridad por fila y no crea roles ni bases', async () => {
    const { rows } = await appUser.query<Record<string, boolean>>(
      'SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
    });
  });

  it('no es dueño de ninguna tabla de negocio, y todas tienen la seguridad por fila forzada', async () => {
    const { rows } = await appUser.query<{ owner: string; enabled: boolean; forced: boolean }>(
      `SELECT pg_get_userbyid(relowner) AS owner, relrowsecurity AS enabled,
              relforcerowsecurity AS forced
         FROM pg_class WHERE relname = ANY($1::text[])`,
      [BUSINESS_TABLES],
    );
    expect(rows).toHaveLength(BUSINESS_TABLES.length);
    for (const row of rows) {
      expect(row).toEqual({ owner: 'migration_user', enabled: true, forced: true });
    }
  });
});

describe('operaciones que app_user no puede hacer', () => {
  const denied: [string, string][] = [
    ['desactivar la seguridad por fila', 'ALTER TABLE core_tenants DISABLE ROW LEVEL SECURITY'],
    ['borrar una política', 'DROP POLICY core_tenants_tenant_isolation ON core_tenants'],
    ['eliminar una tabla', 'DROP TABLE core_outbox_events'],
    ['vaciar una tabla', 'TRUNCATE core_outbox_events'],
    ['borrar filas (el borrado es lógico)', 'DELETE FROM core_tenants'],
    ['crear tablas', 'CREATE TABLE intrusa (id int)'],
    ['leer el historial de migraciones', 'SELECT * FROM _prisma_migrations'],
    [
      'quitar el disparador de columnas de control',
      'DROP TRIGGER core_tenants_control_columns ON core_tenants',
    ],
    ['cambiar de usuario', 'SET ROLE migration_user'],
  ];

  it.each(denied)('%s', async (_description, sql) => {
    await expect(appUser.query(sql)).rejects.toThrow(
      /permission denied|must be owner|must be member/,
    );
  });
});
