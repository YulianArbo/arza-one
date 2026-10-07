import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const API_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');

export interface PrismaCliResult {
  readonly status: number | null;
  readonly output: string;
}

/** Ejecuta la CLI de Prisma contra la base de datos indicada, como migration_user. */
export function runPrismaCli(args: string[], migrationUrl: string): PrismaCliResult {
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_MIGRATION_URL: migrationUrl },
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
