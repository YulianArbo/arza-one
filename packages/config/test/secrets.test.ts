import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { REPO_ROOT, createTempTree, removeTempTree, run } from './support/workspace.js';

const LEFTHOOK = readFileSync(join(REPO_ROOT, 'lefthook.yml'), 'utf8');
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let root = '';

afterEach(() => {
  removeTempTree(root);
});

/** El comando exacto que lefthook ejecuta antes de cada commit. */
function secretsHookCommand(): string[] {
  const match = /run: (gitleaks .+)/.exec(LEFTHOOK);
  if (!match?.[1]) {
    throw new Error('lefthook.yml no ejecuta gitleaks');
  }
  return match[1].trim().split(' ');
}

/** Token falso con el formato de GitHub, generado al vuelo para no guardar secretos en el repo. */
function fakeGithubToken(): string {
  const body = Array.from({ length: 36 }, () => ALPHABET.charAt(randomInt(ALPHABET.length)));
  return ['ghp', body.join('')].join('_');
}

function stageFileAndRunHook(content: string): number | null {
  root = createTempTree({ 'config.ts': content });
  run('git', ['init', '--quiet'], root);
  run('git', ['add', 'config.ts'], root);
  const [command = '', ...args] = secretsHookCommand();
  return run(command, args, root).status;
}

describe('detección de secretos antes del commit', () => {
  it('rechaza un commit que contiene un token', () => {
    const status = stageFileAndRunHook(`export const token = '${fakeGithubToken()}';\n`);
    expect(status).not.toBe(0);
  });

  it('acepta un commit sin secretos', () => {
    const status = stageFileAndRunHook("export const greeting = 'hola';\n");
    expect(status).toBe(0);
  });
});

describe('ganchos de git (lefthook)', () => {
  it('valida el mensaje de cada commit con commitlint', () => {
    expect(LEFTHOOK).toMatch(/commit-msg:[\s\S]*commitlint --edit/);
  });

  it('busca secretos y revisa formato y análisis antes de cada commit', () => {
    expect(LEFTHOOK).toMatch(/pre-commit:[\s\S]*gitleaks git --pre-commit --staged/);
    expect(LEFTHOOK).toMatch(/prettier --check/);
    expect(LEFTHOOK).toMatch(/eslint --max-warnings 0/);
  });
});
