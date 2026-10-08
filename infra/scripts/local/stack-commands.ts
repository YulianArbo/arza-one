// Los tres comandos del entorno local (B06): encender, apagar y reiniciar los datos.
import { setupGarage, type GarageCli, type GarageSettings } from './garage-setup.ts';
import {
  deleteData,
  ensureDocker,
  LocalStackError,
  prepareDatabase,
  startServices,
  stopServices,
  type RunCommand,
  type StackFiles,
} from './local-stack.ts';

export interface StackDependencies {
  readonly run: RunCommand;
  readonly garage: GarageCli;
  readonly files: StackFiles;
  readonly pnpm: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly print: (message: string) => void;
}

export function garageSettings(env: StackDependencies['env']): GarageSettings {
  const bucket = env['S3_BUCKET'];
  const accessKeyId = env['S3_ACCESS_KEY'];
  const secretAccessKey = env['S3_SECRET_KEY'];
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new LocalStackError(
      'Faltan S3_BUCKET, S3_ACCESS_KEY o S3_SECRET_KEY en .env. Vea .env.example.',
    );
  }
  return { bucket, accessKeyId, secretAccessKey };
}

function port(env: StackDependencies['env'], name: string, fallback: string): string {
  const value = env[name];
  return value === undefined || value === '' ? fallback : value;
}

function summary(env: StackDependencies['env']): string {
  return [
    '',
    'Entorno local listo. Servicios en este equipo:',
    `  Base de datos (PostgreSQL)   localhost:${port(env, 'POSTGRES_PORT', '5432')}`,
    `  Colas (Valkey)               localhost:${port(env, 'VALKEY_PORT', '6379')}`,
    `  Archivos (Garage, S3)        http://localhost:${port(env, 'GARAGE_S3_PORT', '3900')}`,
    `  PDF (Gotenberg)              http://localhost:${port(env, 'GOTENBERG_PORT', '3001')}`,
    `  Antivirus (ClamAV)           localhost:${port(env, 'CLAMAV_PORT', '3310')}  (*)`,
    `  Correo de prueba (Mailpit)   http://localhost:${port(env, 'MAILPIT_UI_PORT', '8025')}`,
    '',
    '(*) El antivirus termina de arrancar solo, en unos minutos (la primera vez, hasta 15).',
    '    Para ver el estado de cada servicio: docker compose --file infra/compose/local.yml ps',
    '',
    'Siguiente paso: «pnpm dev» enciende la API, el worker y la web.',
    '',
  ].join('\n');
}

export function infraUp(deps: StackDependencies): void {
  const settings = garageSettings(deps.env);
  ensureDocker(deps.run);
  deps.print('Encendiendo los servicios. La primera vez descarga las imágenes y tarda más.\n');
  startServices(deps.run, deps.files);
  deps.print('Preparando el almacenamiento de archivos (Garage)…\n');
  setupGarage(deps.garage, settings);
  deps.print('Aplicando las migraciones y los datos semilla…\n');
  prepareDatabase(deps.run, deps.pnpm);
  deps.print(summary(deps.env));
}

export function infraDown(deps: Pick<StackDependencies, 'run' | 'files' | 'print'>): void {
  ensureDocker(deps.run);
  stopServices(deps.run, deps.files);
  deps.print('Servicios detenidos. Los datos se conservan; «pnpm infra:up» los enciende.\n');
}

export function infraReset(deps: StackDependencies): void {
  ensureDocker(deps.run);
  deps.print('Borrando los datos locales (base de datos, colas y archivos)…\n');
  deleteData(deps.run, deps.files);
  infraUp(deps);
}
