import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  connect,
  createDatabaseService,
  integrationDatabase,
} from './support/integration-database.js';
import { runPrismaCli } from './support/prisma-cli.js';

// Migraciones (capítulo 11.4, paso 7). global-setup.ts ya las aplicó sobre una base vacía.

let migrationUser: pg.Client;

beforeAll(async () => {
  migrationUser = await connect(integrationDatabase().migrationUrl);
});

afterAll(async () => {
  await migrationUser.end();
});

describe('migraciones', () => {
  it('aplicaron todas desde cero, sin fallas', async () => {
    const { rows } = await migrationUser.query<{ pending: string; failed: string }>(
      `SELECT count(*) FILTER (WHERE finished_at IS NULL) AS pending,
              count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS failed
         FROM _prisma_migrations`,
    );
    expect(rows[0]).toEqual({ pending: '0', failed: '0' });
  });

  it('volver a aplicarlas no cambia nada', () => {
    const result = runPrismaCli(['migrate', 'deploy'], integrationDatabase().migrationUrl);
    expect(result.output).toContain('No pending migrations to apply');
    expect(result.status).toBe(0);
  });

  it('la base de datos coincide con el modelo de Prisma', () => {
    const result = runPrismaCli(
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      integrationDatabase().migrationUrl,
    );
    expect(result.output).not.toContain('CREATE');
    expect(result.status).toBe(0);
  });

  it('la base usa UTF-8, el orden del español de Colombia y la hora UTC (capítulo 12.1)', async () => {
    const { rows } = await migrationUser.query<Record<string, string>>(
      `SELECT pg_encoding_to_char(encoding) AS encoding, datlocale AS locale,
              current_setting('TimeZone') AS timezone
         FROM pg_database WHERE datname = current_database()`,
    );
    expect(rows[0]).toEqual({ encoding: 'UTF8', locale: 'es-CO', timezone: 'UTC' });
  });
});

describe('/health con la base de datos real', () => {
  it('la conexión compartida de la API responde', async () => {
    const database = createDatabaseService();
    try {
      await expect(database.ping()).resolves.toBeUndefined();
    } finally {
      await database.onModuleDestroy();
    }
  });
});
