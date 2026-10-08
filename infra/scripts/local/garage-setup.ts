// Prepara Garage la primera vez (ADR-013): asigna la capacidad del único nodo, crea el depósito
// e importa la llave de acceso del archivo .env. Cada paso revisa antes si ya está hecho, así
// que ejecutarlo de nuevo no cambia nada.
import { LocalStackError, type CommandResult } from './local-stack.ts';

/** Ejecuta la consola de Garage dentro de su contenedor. */
export type GarageCli = (args: readonly string[]) => CommandResult;

export interface GarageSettings {
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

const KEY_NAME = 'arza-one-local';
/** Espacio reservado para archivos en el equipo local. */
const LOCAL_CAPACITY = '10G';
const NO_ROLE = 'No nodes currently have a role';
const LAYOUT_VERSION = /Current cluster layout version: (\d+)/;

function required(cli: GarageCli, args: readonly string[], step: string): CommandResult {
  const result = cli(args);
  if (result.status !== 0) {
    throw new LocalStackError(`Garage: no se pudo ${step}.\n${result.stderr.trim()}`);
  }
  return result;
}

function assignLayout(cli: GarageCli): void {
  const layout = required(cli, ['layout', 'show'], 'leer la distribución').stdout;
  if (!layout.includes(NO_ROLE)) return;
  const nodeId = required(cli, ['node', 'id', '--quiet'], 'leer el nodo').stdout.split('@')[0];
  const version = Number(LAYOUT_VERSION.exec(layout)?.[1] ?? '0');
  required(
    cli,
    ['layout', 'assign', '--zone', 'local', '--capacity', LOCAL_CAPACITY, nodeId?.trim() ?? ''],
    'asignar la capacidad',
  );
  required(cli, ['layout', 'apply', '--version', String(version + 1)], 'aplicar la distribución');
}

export function setupGarage(cli: GarageCli, settings: GarageSettings): void {
  assignLayout(cli);
  if (cli(['bucket', 'info', settings.bucket]).status !== 0) {
    required(cli, ['bucket', 'create', settings.bucket], 'crear el depósito');
  }
  if (cli(['key', 'info', settings.accessKeyId]).status !== 0) {
    required(
      cli,
      ['key', 'import', '--yes', '-n', KEY_NAME, settings.accessKeyId, settings.secretAccessKey],
      'importar la llave de acceso',
    );
  }
  required(
    cli,
    [
      'bucket',
      'allow',
      '--read',
      '--write',
      '--owner',
      settings.bucket,
      '--key',
      settings.accessKeyId,
    ],
    'dar permiso a la llave sobre el depósito',
  );
}
