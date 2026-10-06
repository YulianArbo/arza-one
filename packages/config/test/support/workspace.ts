import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export interface CommandResult {
  status: number | null;
  output: string;
}

/** Crea una carpeta temporal con los archivos indicados (ruta relativa → contenido). */
export function createTempTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'arza-quality-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }
  return root;
}

export function removeTempTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export function run(command: string, args: string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
