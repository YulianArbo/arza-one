import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/workspace.js';

async function lintMessage(message: string): Promise<boolean> {
  const config = await load({}, { cwd: REPO_ROOT });
  const result = await lint(message, config.rules, {
    parserOpts: config.parserPreset?.parserOpts ?? {},
  });
  return result.valid;
}

describe('mensajes de commit (IN-TEC-002)', () => {
  it.each([
    'feat(crm): add quote approval',
    'fix(iam): reject expired sessions',
    'chore: configure lefthook',
  ])('acepta un mensaje válido: %s', async (message) => {
    expect(await lintMessage(message)).toBe(true);
  });

  it.each([
    'arreglé cosas',
    'Feat: Add Something.',
    'update(crm): unknown type',
    'feat(CRM): scope in uppercase',
    'feat: ',
  ])('rechaza un mensaje inválido: "%s"', async (message) => {
    expect(await lintMessage(message)).toBe(false);
  });
});
