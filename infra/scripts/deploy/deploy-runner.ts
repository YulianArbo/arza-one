// Conexión real del despliegue con el sistema (B07): ssh, bash, tar, fetch y el certificado del
// ensayo. La lógica vive en deploy.ts y smoke.ts, que se prueban sin servidor.
import { spawnSync } from 'node:child_process';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';

import { REPO_ROOT } from '../local/paths.ts';
import { compose, BUNDLE_PATHS } from './release.ts';
import { DeployError, sshArgs, type CommandResult, type Remote, type SshTarget } from './remote.ts';

function spawn(command: string, args: readonly string[], input?: string | Buffer): CommandResult {
  // Sin «encoding»: la entrada (texto o el paquete tar) y la salida viajan como bytes.
  const result = spawnSync(command, args, {
    input: typeof input === 'string' ? Buffer.from(input, 'utf8') : input,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.toString('utf8'),
    stderr: `${result.stderr.toString('utf8')}${result.error?.message ?? ''}`,
  };
}

export function sshRemote(target: SshTarget): Remote {
  return (script, input) => spawn('ssh', sshArgs(target, script), input);
}

/** El «servidor» es este mismo equipo (ensayo de GitHub). */
export const localRemote: Remote = (script, input) => spawn('bash', ['-c', script], input);

/** Empaqueta los archivos de la versión desde el repositorio. */
export function createBundle(): Buffer {
  const result = spawnSync('tar', ['-czf', '-', '-C', REPO_ROOT, ...BUNDLE_PATHS], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new DeployError(`No se pudieron empaquetar los archivos: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

/** Ensayo: confía en la autoridad propia de Caddy para que las pruebas de humo usen TLS real. */
export function trustCaddyLocalCa(remote: Remote, baseDir: string, version: string): void {
  const root = '/data/caddy/pki/authorities/local/root.crt';
  const result = remote(compose(baseDir, version, 'exec -T caddy cat', root));
  if (result.status !== 0) {
    throw new DeployError(`No se pudo leer el certificado local de Caddy: ${result.stderr}`);
  }
  setDefaultCACertificates([...getCACertificates('default'), result.stdout]);
}
