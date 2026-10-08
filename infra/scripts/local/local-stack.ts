// Pasos para encender, apagar y reiniciar el entorno local (bloque B06). Los comandos externos
// (docker, pnpm) llegan como una función para poder probar la lógica sin Docker.

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Ejecuta un programa. Con `show`, su salida va directo a la pantalla del usuario. */
export type RunCommand = (
  command: string,
  args: readonly string[],
  options?: { readonly show?: boolean },
) => CommandResult;

/** Falla esperada, con un mensaje en español para quien ejecutó el comando. */
export class LocalStackError extends Error {
  override readonly name = 'LocalStackError';
}

export interface StackFiles {
  readonly composeFile: string;
  readonly envFile: string;
}

/** Volúmenes con datos. Las firmas del antivirus se conservan: descargarlas tarda minutos. */
const DATA_VOLUMES = ['postgres-data', 'valkey-data', 'garage-data'];
const PROJECT = 'arza-one-local';
/** La primera vez ClamAV descarga su base de firmas; se le dan hasta 15 minutos. */
const START_TIMEOUT_SECONDS = 900;

export function composeArgs(files: StackFiles, ...rest: readonly string[]): string[] {
  return ['compose', '--file', files.composeFile, '--env-file', files.envFile, ...rest];
}

export function ensureDocker(run: RunCommand): void {
  if (run('docker', ['info', '--format', '{{.ServerVersion}}']).status !== 0) {
    throw new LocalStackError(
      'Docker no responde. Abra Docker Desktop, espere a que diga «Engine running» y repita.',
    );
  }
}

export function startServices(run: RunCommand, files: StackFiles): void {
  const args = ['up', '--detach', '--wait', '--wait-timeout', String(START_TIMEOUT_SECONDS)];
  if (run('docker', composeArgs(files, ...args), { show: true }).status !== 0) {
    throw new LocalStackError(
      [
        'Los servicios no quedaron listos. Lea el mensaje de Docker de arriba.',
        'Si dice que un puerto está ocupado («port is already allocated» o «bind»), cambie ese',
        'puerto en .env (por ejemplo POSTGRES_PORT=5433 y el mismo número en DATABASE_URL y',
        'DATABASE_MIGRATION_URL) y repita. Guía: docs/runbooks/entorno-local.md',
      ].join('\n'),
    );
  }
}

export function stopServices(run: RunCommand, files: StackFiles): void {
  if (run('docker', composeArgs(files, 'down'), { show: true }).status !== 0) {
    throw new LocalStackError('No se pudieron detener los servicios. Lea el mensaje de Docker.');
  }
}

/** Borra los datos locales (base de datos, colas y archivos). Solo datos ficticios. */
export function deleteData(run: RunCommand, files: StackFiles): void {
  stopServices(run, files);
  const existing = run('docker', ['volume', 'ls', '--quiet']).stdout.split(/\r?\n/);
  const volumes = DATA_VOLUMES.map((volume) => `${PROJECT}_${volume}`).filter((volume) =>
    existing.includes(volume),
  );
  if (volumes.length === 0) return;
  if (run('docker', ['volume', 'rm', ...volumes], { show: true }).status !== 0) {
    throw new LocalStackError('No se pudieron borrar los datos locales. Lea el mensaje de Docker.');
  }
}

/** Aplica las migraciones y carga los datos semilla (idempotentes). */
export function prepareDatabase(run: RunCommand, pnpm: readonly string[]): void {
  const [command = 'pnpm', ...prefix] = pnpm;
  for (const script of ['db:migrate', 'db:seed']) {
    if (run(command, [...prefix, script], { show: true }).status !== 0) {
      throw new LocalStackError(`Falló «pnpm ${script}». Lea el mensaje de arriba.`);
    }
  }
}
