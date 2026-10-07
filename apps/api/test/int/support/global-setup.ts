import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

import type { IntegrationDatabase } from './integration-database.js';
import { runPrismaCli } from './prisma-cli.js';

// Mismo motor (PostgreSQL 17) y mismo guion de usuarios que en los ambientes reales (capítulo 12.1).
const POSTGRES_IMAGE = 'postgres:17';
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

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const appPassword = throwawayPassword();
  const migrationPassword = throwawayPassword();
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withEnvironment({ APP_DB_PASSWORD: appPassword, MIGRATION_DB_PASSWORD: migrationPassword })
    .withCopyFilesToContainer([
      { source: INIT_SCRIPT, target: '/docker-entrypoint-initdb.d/01-roles-and-database.sh' },
    ])
    .start();
  const database: IntegrationDatabase = {
    appUrl: databaseUrl(container, 'app_user', appPassword),
    migrationUrl: databaseUrl(container, 'migration_user', migrationPassword),
  };
  // Las migraciones se aplican desde cero sobre una base vacía (capítulo 11.4, paso 7).
  if (runPrismaCli(['migrate', 'deploy'], database.migrationUrl).status !== 0) {
    await container.stop();
    throw new Error('Las migraciones no aplicaron sobre la base de datos vacía.');
  }
  project.provide('database', database);
  return async () => {
    await container.stop();
  };
}
