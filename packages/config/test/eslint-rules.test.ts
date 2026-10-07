import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/workspace.js';

// Se analiza el texto como si fuera este archivo, que pertenece a un proyecto de TypeScript.
const FILE_PATH = fileURLToPath(import.meta.url);

async function ruleIdsFor(code: string): Promise<(string | null)[]> {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const [result] = await eslint.lintText(code, { filePath: FILE_PATH });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

describe('reglas de código limpio (capítulo 11.2)', () => {
  it('prohíbe el tipo any', async () => {
    const ruleIds = await ruleIdsFor('export const value: any = 1;\n');
    expect(ruleIds).toContain('@typescript-eslint/no-explicit-any');
  });

  it('exige justificar la desactivación de una regla', async () => {
    const code = '// eslint-disable-next-line no-console\nconsole.log(1);\n';
    const ruleIds = await ruleIdsFor(code);
    expect(ruleIds).toContain('@eslint-community/eslint-comments/require-description');
  });

  it('rechaza funciones de más de 40 líneas', async () => {
    const body = Array.from(
      { length: 41 },
      (_, index) => `  const value${String(index)} = ${String(index)};`,
    );
    const code = `export function tooLong(): number {\n${body.join('\n')}\n  return value0;\n}\n`;
    const ruleIds = await ruleIdsFor(code);
    expect(ruleIds).toContain('max-lines-per-function');
  });

  it('rechaza una imagen sin texto alternativo (accesibilidad, 16.6)', async () => {
    const eslint = new ESLint({ cwd: REPO_ROOT });
    const component = `${REPO_ROOT}packages/ui/src/components/skeleton.tsx`;
    const code =
      'import type { JSX } from \'react\';\n\nexport function Logo(): JSX.Element {\n  return <img src="/logo.png" />;\n}\n';
    const [result] = await eslint.lintText(code, { filePath: component });
    const ruleIds = result?.messages.map((message) => message.ruleId) ?? [];
    expect(ruleIds).toContain('jsx-a11y-x/alt-text');
  });

  it('acepta código que cumple las reglas', async () => {
    const ruleIds = await ruleIdsFor(
      'export function sum(a: number, b: number): number {\n  return a + b;\n}\n',
    );
    expect(ruleIds).toEqual([]);
  });
});
