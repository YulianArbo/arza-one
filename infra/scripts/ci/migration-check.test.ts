import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MIGRATIONS_PATH,
  formatReport,
  parseNameStatus,
  reviewMigrations,
  runMigrationCheck,
} from './migration-check.ts';

const NEW_MIGRATION = `${MIGRATIONS_PATH}/20270101000000_crm/migration.sql`;
const OLD_MIGRATION = `${MIGRATIONS_PATH}/20261006000000_core/migration.sql`;

describe('cambios de migraciones frente a la rama base', () => {
  it('lee la salida de git y se queda solo con los archivos migration.sql', () => {
    const output = `A\t${NEW_MIGRATION}\nM\t${MIGRATIONS_PATH}/migration_lock.toml\nD\t${OLD_MIGRATION}\n`;
    expect(parseNameStatus(output)).toEqual([
      { status: 'A', path: NEW_MIGRATION },
      { status: 'D', path: OLD_MIGRATION },
    ]);
  });

  it('acepta migraciones nuevas que solo expanden', () => {
    const report = reviewMigrations(
      [{ status: 'A', path: NEW_MIGRATION }],
      () => 'CREATE TABLE "a" ("id" UUID)',
    );
    expect(report).toEqual({ rewritten: [], findings: [] });
    expect(formatReport(report)).toContain('ningún cambio incompatible');
  });
});

describe('migraciones que la versión anterior no soportaría', () => {
  it('rechaza modificar o borrar una migración ya integrada', () => {
    const report = reviewMigrations(
      [
        { status: 'M', path: OLD_MIGRATION },
        { status: 'D', path: `${MIGRATIONS_PATH}/20261007000000_x/migration.sql` },
      ],
      () => {
        throw new Error('no debe leer migraciones ya integradas');
      },
    );
    expect(report.rewritten).toHaveLength(2);
    expect(formatReport(report)).toContain('no se modifica ni se borra');
  });

  it('explica cada sentencia incompatible y cómo declarar la fase de contraer', () => {
    const report = reviewMigrations(
      [{ status: 'A', path: NEW_MIGRATION }],
      () => 'DROP TABLE "a";',
    );
    const text = formatReport(report);
    expect(report.findings).toHaveLength(1);
    expect(text).toContain(`${NEW_MIGRATION}: borra un objeto`);
    expect(text).toContain('DROP TABLE "a"');
    expect(text).toContain('-- arza:contract');
  });
});

function git(repo: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}

function commitMigration(repo: string, path: string, sql: string): void {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), sql);
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '--no-verify', '-m', 'test: migration');
}

/** Repositorio con una migración integrada en main y una rama de trabajo abierta. */
function createRepository(): string {
  const repo = mkdtempSync(join(tmpdir(), 'arza-migrations-'));
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'ci@arza-one.test');
  git(repo, 'config', 'user.name', 'CI');
  commitMigration(repo, OLD_MIGRATION, 'CREATE TABLE "core" ("id" UUID);');
  git(repo, 'checkout', '--quiet', '-b', 'feature');
  return repo;
}

describe('verificación contra un repositorio git real', () => {
  let repo: string;

  beforeEach(() => {
    repo = createRepository();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repo, { recursive: true, force: true });
  });

  it('pasa con una migración nueva que expande', () => {
    commitMigration(repo, NEW_MIGRATION, 'ALTER TABLE "core" ADD COLUMN "name" TEXT;');
    expect(runMigrationCheck('main', repo)).toBe(0);
  });

  it('falla con una migración nueva que borra una columna', () => {
    commitMigration(repo, NEW_MIGRATION, 'ALTER TABLE "core" DROP COLUMN "id";');
    expect(runMigrationCheck('main', repo)).toBe(1);
  });

  it('falla si se reescribe una migración ya integrada', () => {
    commitMigration(repo, OLD_MIGRATION, 'CREATE TABLE "core" ("id" BIGINT);');
    expect(runMigrationCheck('main', repo)).toBe(1);
  });

  it('informa un error si la rama base no existe', () => {
    expect(runMigrationCheck('no-existe', repo)).toBe(2);
  });
});
