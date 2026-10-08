// Conexión real de los guiones locales con el sistema: ejecuta programas y lee el archivo .env.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import {
  composeArgs,
  LocalStackError,
  type CommandResult,
  type RunCommand,
} from './local-stack.ts';
import { COMPOSE_FILE, ENV_PATH, REPO_ROOT } from './paths.ts';

export const STACK_FILES = { composeFile: COMPOSE_FILE, envFile: ENV_PATH };

export const runCommand: RunCommand = (command, args, options) => {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: options?.show === true ? 'inherit' : 'pipe',
  });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
};

/**
 * Cómo invocar pnpm. Dentro de `pnpm infra:up`, npm_execpath apunta al pnpm que lo lanzó: un
 * programa (pnpm.exe) o un archivo JavaScript, que se ejecuta con el mismo Node. Así no se pasa
 * por la consola del sistema.
 */
export function pnpmCommand(): string[] {
  const execPath = process.env['npm_execpath'];
  if (execPath === undefined || execPath === '') {
    throw new LocalStackError('Ejecute este guion con pnpm (por ejemplo, pnpm infra:up).');
  }
  return /\.[cm]?js$/.test(execPath) ? [process.execPath, execPath] : [execPath];
}

export function readEnvFile(): Readonly<Record<string, string | undefined>> {
  if (!existsSync(ENV_PATH)) {
    throw new LocalStackError(
      'Falta el archivo .env. Créelo con «pnpm env:local» y repita el comando.',
    );
  }
  return parseEnv(readFileSync(ENV_PATH, 'utf8'));
}

export function garageCli(args: readonly string[]): CommandResult {
  return runCommand('docker', composeArgs(STACK_FILES, 'exec', '-T', 'garage', '/garage', ...args));
}

/** Ejecuta un comando local y muestra solo el mensaje de una falla esperada. */
export function main(work: () => void): void {
  try {
    work();
  } catch (error) {
    if (!(error instanceof LocalStackError)) throw error;
    process.stderr.write(`\n${error.message}\n`);
    process.exitCode = 1;
  }
}
