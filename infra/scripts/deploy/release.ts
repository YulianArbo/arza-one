// Una versión desplegada en un servidor (B07 pruebas, B44 producción). Cada una vive en su carpeta,
//   <base>/releases/<versión>/infra/...   (compose, Caddy, PostgreSQL y Garage de esa versión)
//   <base>/releases/<versión>/release.env (versión y registro de imágenes)
// y el enlace <base>/current apunta a la que está encendida. Volver atrás es mover el enlace.
import { DeployError, shellQuote } from './remote.ts';

export type DeployEnvironment = 'staging' | 'production';

/** Lo que cambia entre el ambiente de pruebas y el de producción. */
export interface EnvironmentProfile {
  /** Nombre fijo del proyecto de Docker Compose: los volúmenes sobreviven a cada versión. */
  readonly project: string;
  readonly composeFile: string;
  /** Archivos del repositorio que viajan con cada versión. */
  readonly bundlePaths: readonly string[];
  /** Depósito de Garage con los archivos de la plataforma. */
  readonly bucket: string;
  /** Servicios que deben quedar sanos para dar la versión por encendida. */
  readonly appServices: readonly string[];
  /** Pruebas: carga los datos ficticios. Producción: nunca (solo catálogos y la plataforma). */
  readonly demoData: boolean;
}

const COMMON_PATHS = [
  'infra/postgres/init',
  'infra/garage/garage.local.toml',
  // Para revisar el servidor en cualquier momento (sudo bash current/infra/server/verify.sh).
  'infra/server/verify.sh',
];

export const PROFILES: Readonly<Record<DeployEnvironment, EnvironmentProfile>> = {
  staging: {
    project: 'arza-one-staging',
    composeFile: 'infra/compose/staging.yml',
    bundlePaths: ['infra/compose/staging.yml', 'infra/caddy/Caddyfile', ...COMMON_PATHS],
    bucket: 'arza-one-staging',
    appServices: ['caddy', 'web', 'api', 'worker', 'gotenberg', 'mailpit'],
    demoData: true,
  },
  production: {
    project: 'arza-one-production',
    composeFile: 'infra/compose/production.yml',
    bundlePaths: [
      'infra/compose/production.yml',
      'infra/caddy/Caddyfile.production',
      'infra/backup',
      'infra/monitoring/host-metrics.sh',
      ...COMMON_PATHS,
    ],
    bucket: 'arza-one-production',
    appServices: ['caddy', 'web', 'api', 'worker', 'gotenberg'],
    demoData: false,
  },
};

/** Dónde se despliega: la carpeta del servidor y el ambiente. */
export interface Target {
  readonly baseDir: string;
  readonly environment: DeployEnvironment;
}

/** Commit (7 a 40 caracteres hexadecimales) o etiqueta vX.Y.Z. Nada más llega a bash. */
const VERSION = /^(?:[0-9a-f]{7,40}|v\d+\.\d+\.\d+)$/;
/** Registro de imágenes: dominio con puerto opcional y ruta en minúsculas. */
const REGISTRY = /^[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9._-]+)*$/;
/** Carpeta absoluta del servidor, sin espacios ni caracteres especiales. */
const BASE_DIR = /^\/[A-Za-z0-9._/-]+$/;

export interface ReleaseSettings extends Target {
  readonly version: string;
  readonly registry: string;
}

export function validateRelease(settings: ReleaseSettings): ReleaseSettings {
  if (!VERSION.test(settings.version)) {
    throw new DeployError(
      `Versión no válida: «${settings.version}». Se espera un commit o vX.Y.Z.`,
    );
  }
  if (!REGISTRY.test(settings.registry)) {
    throw new DeployError(`Registro de imágenes no válido: «${settings.registry}».`);
  }
  if (!BASE_DIR.test(settings.baseDir)) {
    throw new DeployError(`Carpeta del servidor no válida: «${settings.baseDir}».`);
  }
  return settings;
}

export function releaseDir(baseDir: string, version: string): string {
  return `${baseDir}/releases/${version}`;
}

/** Contenido de release.env: lo único que cambia entre una versión y otra. */
export function releaseEnv(settings: ReleaseSettings): string {
  return `APP_VERSION=${settings.version}\nIMAGE_REGISTRY=${settings.registry}\n`;
}

/** `docker compose` con los archivos de una versión y las contraseñas del servidor. */
export function compose(target: Target, version: string, ...args: readonly string[]): string {
  const { baseDir } = target;
  const profile = PROFILES[target.environment];
  const dir = releaseDir(baseDir, version);
  return [
    'docker compose',
    `--project-name ${profile.project}`,
    `--file ${shellQuote(`${dir}/${profile.composeFile}`)}`,
    `--env-file ${shellQuote(`${baseDir}/.env`)}`,
    `--env-file ${shellQuote(`${dir}/release.env`)}`,
    ...args,
  ].join(' ');
}

/** Lee la versión encendida a partir del enlace current. Vacío si nunca se ha desplegado. */
export function currentVersionScript(baseDir: string): string {
  const link = shellQuote(`${baseDir}/current`);
  return `if [ -L ${link} ]; then basename "$(readlink ${link})"; fi`;
}

/** Mueve el enlace current de forma atómica (nunca queda a medias). */
export function switchScript(baseDir: string, version: string): string {
  const next = shellQuote(`${baseDir}/current.next`);
  return [
    `ln -sfn ${shellQuote(releaseDir(baseDir, version))} ${next}`,
    `mv -T ${next} ${shellQuote(`${baseDir}/current`)}`,
  ].join('\n');
}

export function parseVersion(stdout: string): string | undefined {
  const version = stdout.trim();
  return VERSION.test(version) ? version : undefined;
}
