import { fileURLToPath } from 'node:url';

import { defineConfig } from 'prisma/config';

// Prisma no lee el archivo .env por sí solo. Las variables ya definidas en el ambiente mandan.
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // Sin archivo .env (integración continua, pruebas): se usan las variables del ambiente.
}

// Las migraciones las aplica migration_user, dueño del esquema; la API usa app_user (ADR-007).
const migrationUrl = process.env['DATABASE_MIGRATION_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(migrationUrl === undefined ? {} : { datasource: { url: migrationUrl } }),
});
