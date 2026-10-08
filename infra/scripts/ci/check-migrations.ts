// Uso: node infra/scripts/ci/check-migrations.ts <rama-base>   (por ejemplo origin/main)
import { fileURLToPath } from 'node:url';

import { runMigrationCheck } from './migration-check.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

process.exitCode = runMigrationCheck(process.argv[2] ?? 'origin/main', REPO_ROOT);
