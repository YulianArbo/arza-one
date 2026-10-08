// Cómo el despliegue (B07) le da órdenes al servidor de pruebas. Cada orden es un guion de bash:
// por SSH en el servidor real o en este mismo equipo en el ensayo de GitHub. Llega como una
// función para poder probar la lógica del despliegue sin servidor.
import type { CommandResult } from '../local/local-stack.ts';

export type { CommandResult };

/** Ejecuta un guion de bash en el servidor. `input` llega por la entrada estándar. */
export type Remote = (script: string, input?: string | Buffer) => CommandResult;

/** Falla esperada del despliegue, con un mensaje en español para quien lo revisa en GitHub. */
export class DeployError extends Error {
  override readonly name = 'DeployError';
}

/** Comillas simples de bash: el valor llega literal, sin expandir nada. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export interface SshTarget {
  readonly host: string;
  readonly user: string;
  readonly port: number;
}

/**
 * Argumentos de ssh. Solo con llave (BatchMode) y solo si la huella del servidor ya está en
 * known_hosts: nunca se acepta un servidor desconocido.
 */
export function sshArgs(target: SshTarget, script: string): string[] {
  return [
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=20',
    '-p',
    String(target.port),
    `${target.user}@${target.host}`,
    `bash -c ${shellQuote(script)}`,
  ];
}

/** Las últimas líneas de un error, para el mensaje sin inundar el registro. */
export function tail(text: string, lines = 15): string {
  return text.trim().split(/\r?\n/).slice(-lines).join('\n');
}

/** Ejecuta un paso obligatorio: si falla, detiene el despliegue con el motivo. */
export function required(
  remote: Remote,
  step: string,
  script: string,
  input?: string | Buffer,
): CommandResult {
  const result = remote(`set -euo pipefail\n${script}`, input);
  if (result.status !== 0) {
    const detail = tail(`${result.stderr}\n${result.stdout}`);
    throw new DeployError(`Falló el paso «${step}».${detail === '' ? '' : `\n${detail}`}`);
  }
  return result;
}
