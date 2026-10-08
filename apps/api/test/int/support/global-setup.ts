import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

import type { IntegrationDatabase } from './integration-database.js';
import { runPrismaCli } from './prisma-cli.js';

// Mismo motor (PostgreSQL 17) y mismo guion de usuarios que en los ambientes reales (capítulo 12.1).
const POSTGRES_IMAGE = 'postgres:17';
// Mismo motor de colas que el entorno local (B06), con contraseña como allí.
const VALKEY_IMAGE = 'valkey/valkey:8';
const INIT_SCRIPT = fileURLToPath(
  new URL('../../../../../infra/postgres/init/01-roles-and-database.sh', import.meta.url),
);
/** Contraseñas desechables, distintas en cada ejecución; nunca se escriben en el repositorio. */
function throwawayPassword(): string {
  return randomBytes(18).toString('hex');
}

function databaseUrl(
  container: StartedPostgreSqlContainer,
  user: string,
  password: string,
): string {
  const host = `${container.getHost()}:${String(container.getMappedPort(5432))}`;
  return `postgresql://${user}:${password}@${host}/arza_one`;
}

async function startValkey(password: string): Promise<StartedTestContainer> {
  return new GenericContainer(VALKEY_IMAGE)
    .withCommand(['valkey-server', '--requirepass', password])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();
}

async function startPostgres(): Promise<{
  container: StartedPostgreSqlContainer;
  database: IntegrationDatabase;
}> {
  const appPassword = throwawayPassword();
  const migrationPassword = throwawayPassword();
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withEnvironment({ APP_DB_PASSWORD: appPassword, MIGRATION_DB_PASSWORD: migrationPassword })
    .withCopyFilesToContainer([
      { source: INIT_SCRIPT, target: '/docker-entrypoint-initdb.d/01-roles-and-database.sh' },
    ])
    .start();
  return {
    container,
    database: {
      appUrl: databaseUrl(container, 'app_user', appPassword),
      migrationUrl: databaseUrl(container, 'migration_user', migrationPassword),
    },
  };
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const valkeyPassword = throwawayPassword();
  const [{ container, database }, valkey] = await Promise.all([
    startPostgres(),
    startValkey(valkeyPassword),
  ]);
  const stopAll = async (): Promise<void> => {
    await Promise.all([container.stop(), valkey.stop()]);
  };
  // Las migraciones se aplican desde cero sobre una base vacía (capítulo 11.4, paso 7).
  if (runPrismaCli(['migrate', 'deploy'], database.migrationUrl).status !== 0) {
    await stopAll();
    throw new Error('Las migraciones no aplicaron sobre la base de datos vacía.');
  }
  project.provide('database', database);
  const valkeyHost = `${valkey.getHost()}:${String(valkey.getMappedPort(6379))}`;
  project.provide('valkeyUrl', `redis://:${valkeyPassword}@${valkeyHost}`);
  return stopAll;
}
