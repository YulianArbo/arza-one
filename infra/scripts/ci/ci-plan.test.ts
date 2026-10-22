import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatOutputs,
  hasPassingVerification,
  isDocumentation,
  isInfrastructure,
  planChecks,
  runCheckPlan,
  type PlanEnvironment,
  type PlanInput,
} from './ci-plan.ts';

const CODE = ['apps/api/src/modules/doc/application/create-document.ts'];

function input(overrides: Partial<PlanInput>): PlanInput {
  return {
    event: 'pull_request',
    fullRun: false,
    changedFiles: CODE,
    verifiedMerge: false,
    ...overrides,
  };
}

function flags(plan: ReturnType<typeof planChecks>): [boolean, boolean, boolean] {
  return [plan.quality, plan.tests, plan.rehearsals];
}

describe('clasificación de archivos', () => {
  it.each([
    ['docs/bloques/B21.md', true],
    ['docs/manual/img/image8.png', true],
    ['README.md', true],
    ['apps/web/src/app/page.tsx', false],
  ])('%s es documentación: %s', (path, expected) => {
    expect(isDocumentation(path)).toBe(expected);
  });

  it.each([
    ['infra/scripts/deploy/rehearsal.sh', true],
    ['.github/workflows/ci.yml', true],
    ['apps/api/Dockerfile', true],
    ['apps/web/package.json', true],
    ['pnpm-lock.yaml', true],
    ['.nvmrc', true],
    ['.dockerignore', true],
    ['apps/api/src/main.ts', false],
    ['apps/api/prisma/migrations/20270101000000_x/migration.sql', false],
  ])('%s es infraestructura: %s', (path, expected) => {
    expect(isInfrastructure(path)).toBe(expected);
  });
});

describe('casos en que corre todo (ADR-024)', () => {
  it('con CI_FULL_RUN corre todo, aunque sea solo documentación', () => {
    const plan = planChecks(input({ fullRun: true, changedFiles: ['docs/a.md'] }));
    expect(flags(plan)).toEqual([true, true, true]);
    expect(plan.reason).toContain('CI_FULL_RUN');
  });

  it('lanzada a mano corre todo', () => {
    expect(flags(planChecks(input({ event: 'workflow_dispatch' })))).toEqual([true, true, true]);
  });

  it('si no sabe qué cambió, corre todo por seguridad', () => {
    expect(flags(planChecks(input({ changedFiles: null })))).toEqual([true, true, true]);
  });
});

describe('qué tareas corren en un pull request (ADR-024)', () => {
  it('un pull request solo de documentación revisa formato pero no prueba código', () => {
    const plan = planChecks(input({ changedFiles: ['docs/bloques/B21.md', 'README.md'] }));
    expect(flags(plan)).toEqual([true, false, false]);
  });

  it('un pull request de código corre las pruebas y deja los ensayos para main', () => {
    const plan = planChecks(input({}));
    expect(flags(plan)).toEqual([true, true, false]);
    expect(plan.reason).toContain('al fusionar a main');
  });

  it('un pull request que toca infraestructura corre también los ensayos', () => {
    const plan = planChecks(input({ changedFiles: [...CODE, 'infra/server/provision.sh'] }));
    expect(flags(plan)).toEqual([true, true, true]);
  });
});

describe('qué tareas corren en main (ADR-024)', () => {
  it('una fusión ya verificada en main corre solo los ensayos', () => {
    const plan = planChecks(input({ event: 'push', verifiedMerge: true }));
    expect(flags(plan)).toEqual([false, false, true]);
  });

  it('un cambio en main sin verificación previa corre todo', () => {
    expect(flags(planChecks(input({ event: 'push' })))).toEqual([true, true, true]);
  });

  it('una fusión verificada solo de documentación no repite nada', () => {
    const plan = planChecks(input({ event: 'push', verifiedMerge: true, changedFiles: ['a.md'] }));
    expect(flags(plan)).toEqual([false, false, false]);
  });

  it('escribe las salidas para GitHub', () => {
    expect(formatOutputs(planChecks(input({})))).toBe(
      'quality=true\ntests=true\nrehearsals=false\n',
    );
  });
});

describe('verificación previa en el pull request', () => {
  it('reconoce la tarea «Verificaciones» en verde', () => {
    const response = {
      check_runs: [
        { name: 'Verificaciones', conclusion: 'failure' },
        { name: 'Verificaciones', conclusion: 'success' },
      ],
    };
    expect(hasPassingVerification(response)).toBe(true);
  });

  it.each([
    ['sin respuesta', null],
    ['respuesta sin tareas', {}],
    ['tareas mal formadas', { check_runs: 'x' }],
    ['solo fallidas', { check_runs: [{ name: 'Verificaciones', conclusion: 'failure' }] }],
    ['otra tarea en verde', { check_runs: [{ name: '4. Pruebas', conclusion: 'success' }] }],
    ['elemento inválido', { check_runs: [null] }],
  ])('no la da por buena: %s', (_label, response) => {
    expect(hasPassingVerification(response)).toBe(false);
  });
});

function git(repo: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function commit(repo: string, path: string, content: string): string {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
  git(repo, 'add', '.');
  git(repo, 'commit', '--quiet', '--no-verify', '-m', `test: ${path}`);
  return git(repo, 'rev-parse', 'HEAD');
}

function createRepository(): { repo: string; base: string } {
  const repo = mkdtempSync(join(tmpdir(), 'arza-ci-plan-'));
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'user.email', 'ci@arza-one.test');
  git(repo, 'config', 'user.name', 'CI');
  const base = commit(repo, 'apps/api/src/main.ts', 'export {};\n');
  return { repo, base };
}

function merge(repo: string, branch: string): void {
  git(repo, 'checkout', '--quiet', 'main');
  git(repo, 'merge', '--quiet', '--no-ff', '--no-verify', '-m', 'Merge pull request', branch);
}

const PASSED = { check_runs: [{ name: 'Verificaciones', conclusion: 'success' }] };
const ALL = 'quality=true\ntests=true\nrehearsals=true\n';
let repo: string;
let base: string;

function useRepository(): void {
  beforeEach(() => {
    ({ repo, base } = createRepository());
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repo, { recursive: true, force: true });
  });
}

function environment(overrides: Partial<PlanEnvironment>): PlanEnvironment {
  return {
    event: 'push',
    fullRun: undefined,
    baseSha: base,
    repoRoot: repo,
    fetchCheckRuns: () => Promise.resolve(PASSED),
    ...overrides,
  };
}

async function outputsFor(env: PlanEnvironment): Promise<string> {
  const outputFile = join(repo, 'github-output.txt');
  expect(await runCheckPlan(env, outputFile)).toBe(0);
  return readFileSync(outputFile, 'utf8');
}

describe('fusiones en main contra un repositorio git real', () => {
  useRepository();

  it('una fusión al día y verificada en su pull request corre solo los ensayos', async () => {
    git(repo, 'checkout', '--quiet', '-b', 'feature');
    commit(repo, 'apps/api/src/feature.ts', 'export const a = 1;\n');
    merge(repo, 'feature');
    const fetchCheckRuns = vi.fn(() => Promise.resolve(PASSED));
    expect(await outputsFor(environment({ fetchCheckRuns }))).toBe(
      'quality=false\ntests=false\nrehearsals=true\n',
    );
    expect(fetchCheckRuns).toHaveBeenCalledWith(git(repo, 'rev-parse', 'feature'));
  });

  it('si la verificación del pull request no pasó, corre todo', async () => {
    git(repo, 'checkout', '--quiet', '-b', 'feature');
    commit(repo, 'apps/api/src/feature.ts', 'export const a = 1;\n');
    merge(repo, 'feature');
    const env = environment({ fetchCheckRuns: () => Promise.resolve(null) });
    expect(await outputsFor(env)).toBe(ALL);
  });

  it('si la rama no estaba al día con main, el código fusionado es otro: corre todo', async () => {
    git(repo, 'checkout', '--quiet', '-b', 'feature');
    commit(repo, 'apps/api/src/feature.ts', 'export const a = 1;\n');
    git(repo, 'checkout', '--quiet', 'main');
    commit(repo, 'apps/api/src/other.ts', 'export const b = 2;\n');
    merge(repo, 'feature');
    expect(await outputsFor(environment({}))).toBe(ALL);
  });
});

describe('otros cambios contra un repositorio git real', () => {
  useRepository();

  it('un commit directo (sin fusión) corre todo', async () => {
    commit(repo, 'apps/api/src/feature.ts', 'export const a = 1;\n');
    expect(await outputsFor(environment({}))).toBe(ALL);
  });

  it('un pull request de código no consulta GitHub y deja los ensayos para main', async () => {
    commit(repo, 'apps/api/src/feature.ts', 'export const a = 1;\n');
    const fetchCheckRuns = vi.fn(() => Promise.resolve(PASSED));
    const env = environment({ event: 'pull_request', fetchCheckRuns });
    expect(await outputsFor(env)).toBe('quality=true\ntests=true\nrehearsals=false\n');
    expect(fetchCheckRuns).not.toHaveBeenCalled();
  });

  it('sin commit anterior (primer envío de una rama) corre todo', async () => {
    const env = environment({ event: 'pull_request', baseSha: '0'.repeat(40) });
    expect(await outputsFor(env)).toBe(ALL);
  });

  it('con un commit anterior que no existe corre todo', async () => {
    const env = environment({ event: 'pull_request', baseSha: 'f'.repeat(40) });
    expect(await outputsFor(env)).toBe(ALL);
  });
});
