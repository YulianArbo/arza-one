import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { applyContractMarker, findUnsafeStatements, type Finding } from './migration-safety.ts';

export const MIGRATIONS_PATH = 'apps/api/prisma/migrations';

/** Un archivo de migración cambiado frente a la rama base, como lo reporta git. */
export interface MigrationChange {
  status: string;
  path: string;
}

export interface MigrationReport {
  /** Migraciones ya integradas que se modificaron o borraron: nunca se permite. */
  rewritten: string[];
  findings: Finding[];
}

/** Interpreta la salida de `git diff --name-status --no-renames`. */
export function parseNameStatus(output: string): MigrationChange[] {
  return output
    .split('\n')
    .map((line) => line.trim().split('\t'))
    .filter((parts): parts is [string, string] => parts.length === 2)
    .map(([status, path]) => ({ status, path }))
    .filter((change) => change.path.endsWith('/migration.sql'));
}

/** Revisa las migraciones nuevas y que las ya integradas no cambien. */
export function reviewMigrations(
  changes: readonly MigrationChange[],
  readSql: (path: string) => string,
): MigrationReport {
  const rewritten = changes.filter((change) => change.status !== 'A').map((change) => change.path);
  const findings = changes
    .filter((change) => change.status === 'A')
    .flatMap((change) => {
      const sql = readSql(change.path);
      return applyContractMarker(sql, findUnsafeStatements(change.path, sql));
    });
  return { rewritten, findings };
}

/** Texto para la persona que lee el resultado de la verificación. */
export function formatReport(report: MigrationReport): string {
  if (report.rewritten.length === 0 && report.findings.length === 0) {
    return 'Migraciones: ningún cambio incompatible con la versión anterior.';
  }
  const lines = ['Migraciones: hay cambios que la versión anterior no soportaría.'];
  for (const path of report.rewritten) {
    lines.push(
      `  - ${path}: una migración ya integrada no se modifica ni se borra; cree una nueva.`,
    );
  }
  for (const finding of report.findings) {
    lines.push(`  - ${finding.file}: ${finding.reason}.`, `      ${finding.statement}`);
  }
  lines.push(
    'Si el cambio es la fase de contraer (numeral 10.6), agregue en la migración la línea',
    '  -- arza:contract <motivo y versión desde la que ya no se usa>',
  );
  return lines.join('\n');
}

/** Compara las migraciones del cambio con las de la rama base. Devuelve el código de salida. */
export function runMigrationCheck(baseRef: string, repoRoot: string): number {
  const diff = spawnSync(
    'git',
    ['diff', '--name-status', '--no-renames', `${baseRef}...HEAD`, '--', MIGRATIONS_PATH],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (diff.status !== 0) {
    process.stderr.write(`No se pudo comparar con ${baseRef}: ${diff.stderr}\n`);
    return 2;
  }
  const report = reviewMigrations(parseNameStatus(diff.stdout), (path) =>
    readFileSync(join(repoRoot, path), 'utf8'),
  );
  process.stdout.write(`${formatReport(report)}\n`);
  return report.rewritten.length === 0 && report.findings.length === 0 ? 0 : 1;
}
