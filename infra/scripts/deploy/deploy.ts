// Despliegue con reversión automática (numeral 10.6): al ambiente de pruebas (B07) y a producción
// (B44, con la aprobación del Director General sobre una versión etiquetada).
//
//  1. Sube los archivos de la versión y descarga sus imágenes.   ┐ Si algo falla aquí, la versión
//  2. Enciende los datos, prepara Garage y copia la base.         │ anterior sigue encendida y no
//  3. Aplica las migraciones y los datos semilla (los ficticios,  ┘ se toca.
//     solo en pruebas).
//  4. Cambia el enlace current y enciende la versión nueva.       ┐ Si algo falla aquí, vuelve
//  5. Pruebas de humo desde fuera y del aislamiento entre empresas ┘ sola a la versión anterior.
//
// Las migraciones se escriben compatibles hacia atrás (expandir, migrar, contraer; B05), por eso
// la versión anterior funciona con la base ya migrada y la reversión no toca la base.
import { setupGarage, type GarageCli } from '../local/garage-setup.ts';
import { LocalStackError } from '../local/local-stack.ts';
import { checkIsolation } from './isolation.ts';
import {
  compose,
  currentVersionScript,
  parseVersion,
  PROFILES,
  releaseDir,
  releaseEnv,
  switchScript,
  validateRelease,
  type ReleaseSettings,
  type Target,
} from './release.ts';
import { DeployError, required, shellQuote, tail, type Remote } from './remote.ts';

interface RegistryLogin {
  readonly host: string;
  readonly user: string;
  readonly token: string;
}

export interface DeploySettings extends ReleaseSettings {
  /** Archivos de la versión (tar.gz de BUNDLE_PATHS). */
  readonly bundle: Buffer;
  /** Sin credenciales, el registro es público o local (ensayo de GitHub). */
  readonly registryLogin?: RegistryLogin;
}

export interface DeployDependencies {
  readonly remote: Remote;
  /** Pruebas de humo desde fuera del servidor. Devuelve las fallas (vacío si todo pasó). */
  readonly smoke: (version: string) => Promise<string[]>;
  /** Se llama justo antes de las pruebas de humo (el ensayo confía aquí en el certificado local). */
  readonly beforeSmoke?: (version: string) => void;
  readonly print: (message: string) => void;
  readonly now: () => Date;
}

type DeployResult = 'deployed' | 'rolled_back' | 'failed';

export interface DeployOutcome {
  readonly result: DeployResult;
  readonly version: string;
  readonly previous?: string | undefined;
  readonly reason?: string;
}

const DATA_SERVICES = ['postgres', 'valkey', 'garage'];
const WAIT = '--wait --wait-timeout 300';
/** Versiones y copias de la base que se conservan en el servidor. */
const KEPT_RELEASES = 5;
const KEPT_BACKUPS = 10;

/** Variables de la llave de Garage: se expanden en el servidor, nunca viajan desde GitHub. */
const SERVER_SECRETS = new Set(['${S3_ACCESS_KEY}', '${S3_SECRET_KEY}']);

function loadServerEnv(baseDir: string): string {
  return `set -a; . ${shellQuote(`${baseDir}/.env`)}; set +a`;
}

function garageCli(remote: Remote, settings: DeploySettings): GarageCli {
  return (args) => {
    const quoted = args.map((arg) => (SERVER_SECRETS.has(arg) ? `"${arg}"` : shellQuote(arg)));
    const command = compose(settings, settings.version, 'exec -T garage /garage');
    return remote(`${loadServerEnv(settings.baseDir)}\n${command} ${quoted.join(' ')}`);
  };
}

/** Garage la primera vez: capacidad, depósito y llave (la misma lógica del entorno local, B06). */
function prepareFiles(remote: Remote, settings: DeploySettings): void {
  try {
    setupGarage(garageCli(remote, settings), {
      bucket: PROFILES[settings.environment].bucket,
      accessKeyId: '${S3_ACCESS_KEY}',
      secretAccessKey: '${S3_SECRET_KEY}',
    });
  } catch (error) {
    if (error instanceof LocalStackError) throw new DeployError(error.message);
    throw error;
  }
}

function upload(remote: Remote, settings: DeploySettings): void {
  const dir = shellQuote(releaseDir(settings.baseDir, settings.version));
  required(
    remote,
    'subir los archivos de la versión',
    `rm -rf ${dir}\nmkdir -p ${dir}\ntar -xzf - -C ${dir}`,
    settings.bundle,
  );
  required(
    remote,
    'registrar la versión',
    `cat > ${shellQuote(`${releaseDir(settings.baseDir, settings.version)}/release.env`)}`,
    releaseEnv(settings),
  );
}

function login(remote: Remote, registry: RegistryLogin | undefined): void {
  if (registry === undefined) return;
  required(
    remote,
    'entrar al registro de imágenes',
    `docker login ${shellQuote(registry.host)} --username ${shellQuote(registry.user)} --password-stdin`,
    registry.token,
  );
}

function logout(remote: Remote, registry: RegistryLogin | undefined): void {
  if (registry !== undefined) remote(`docker logout ${shellQuote(registry.host)}`);
}

/** Copia de la base antes de migrar (numeral 10.6). Solo si ya había una versión encendida. */
function backup(
  remote: Remote,
  settings: DeploySettings,
  previous: string | undefined,
  now: Date,
): void {
  if (previous === undefined) return;
  const dir = `${settings.baseDir}/backups`;
  const stamp = now.toISOString().replaceAll(/[-:]/g, '').slice(0, 15);
  const file = shellQuote(`${dir}/${stamp}Z-antes-de-${settings.version}.dump`);
  const dump = compose(
    settings,
    settings.version,
    'exec -T postgres pg_dump --username postgres --format custom arza_one',
  );
  required(
    remote,
    'copiar la base de datos antes de migrar',
    [
      `mkdir -p ${shellQuote(dir)}`,
      `${dump} > ${file}`,
      `ls -1t ${shellQuote(dir)}/*.dump | tail -n +${String(KEPT_BACKUPS + 1)} | xargs -r rm --`,
    ].join('\n'),
  );
}

/** Pasos que no tocan la versión encendida: si fallan, la anterior sigue sirviendo. */
function prepare(
  deps: DeployDependencies,
  settings: DeploySettings,
  previous: string | undefined,
): void {
  const { remote } = deps;
  const { version } = settings;
  upload(remote, settings);
  required(
    remote,
    'descargar las imágenes',
    compose(settings, version, '--profile tools pull --quiet'),
  );
  required(
    remote,
    'encender la base de datos, las colas y los archivos',
    compose(settings, version, 'up --detach', WAIT, ...DATA_SERVICES),
  );
  prepareFiles(remote, settings);
  backup(remote, settings, previous, deps.now());
  required(remote, 'aplicar las migraciones', compose(settings, version, 'run --rm migrate'));
  required(remote, 'cargar los datos semilla', compose(settings, version, seedCommand(settings)));
}

/** Catálogos y empresa de la plataforma; los datos ficticios, solo en pruebas (B44). */
function seedCommand(target: Target): string {
  const demo = PROFILES[target.environment].demoData ? ' --demo' : '';
  return `run --rm --no-deps api node dist/platform/database/seed/seed-main.js${demo}`;
}

/** Enciende una versión ya preparada. ClamAV arranca aparte: tarda minutos y nada lo usa aún. */
function start(remote: Remote, target: Target, version: string): void {
  required(remote, 'cambiar a la versión', switchScript(target.baseDir, version));
  const services = PROFILES[target.environment].appServices;
  required(
    remote,
    'encender la versión',
    [
      compose(target, version, 'up --detach --remove-orphans', WAIT, ...services),
      compose(target, version, 'up --detach'),
    ].join('\n'),
  );
}

async function verify(
  deps: DeployDependencies,
  target: Target,
  version: string,
): Promise<string | undefined> {
  deps.beforeSmoke?.(version);
  const failures = await deps.smoke(version);
  if (failures.length > 0) return `pruebas de humo: ${failures.join('; ')}`;
  return checkIsolation(deps.remote, target, version);
}

/** Enciende otra vez la versión anterior y comprueba que responde. */
async function rollBack(
  deps: DeployDependencies,
  target: Target,
  previous: string,
): Promise<string | undefined> {
  deps.print(`\nVolviendo a la versión anterior (${previous})…\n`);
  try {
    start(deps.remote, target, previous);
    return await verify(deps, target, previous);
  } catch (error) {
    if (error instanceof DeployError) return error.message;
    throw error;
  }
}

function record(deps: DeployDependencies, baseDir: string, outcome: DeployOutcome): void {
  const line = `${JSON.stringify({ at: deps.now().toISOString(), ...outcome })}\n`;
  deps.remote(`cat >> ${shellQuote(`${baseDir}/deployments.log`)}`, line);
}

/** Borra versiones viejas (nunca la encendida ni la anterior) e imágenes de más de 30 días. */
function cleanUp(remote: Remote, settings: DeploySettings, previous: string | undefined): void {
  const keep = [settings.version, previous].filter((value) => value !== undefined);
  const releases = shellQuote(`${settings.baseDir}/releases`);
  const exclude = keep.map((version) => `-e ${shellQuote(`^${version}$`)}`).join(' ');
  remote(
    [
      `ls -1t ${releases} | grep -v ${exclude} | tail -n +${String(KEPT_RELEASES - 1)} | xargs -r -I{} rm -rf ${releases}/{}`,
      'docker image prune --all --force --filter until=720h > /dev/null',
    ].join('\n'),
  );
}

async function deployPrepared(
  deps: DeployDependencies,
  settings: DeploySettings,
  previous: string | undefined,
): Promise<DeployOutcome> {
  const { version } = settings;
  let problem: string | undefined;
  try {
    start(deps.remote, settings, version);
    problem = await verify(deps, settings, version);
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;
    problem = error.message;
  }
  if (problem === undefined) return { result: 'deployed', version, previous };
  if (previous === undefined) return { result: 'failed', version, reason: problem };
  const rollbackProblem = await rollBack(deps, settings, previous);
  return rollbackProblem === undefined
    ? { result: 'rolled_back', version, previous, reason: problem }
    : {
        result: 'failed',
        version,
        previous,
        reason: `${problem}\nLa reversión también falló: ${rollbackProblem}`,
      };
}

export async function deploy(
  deps: DeployDependencies,
  input: DeploySettings,
): Promise<DeployOutcome> {
  validateRelease(input);
  const settings = input;
  const { remote } = deps;
  const previous = parseVersion(
    required(remote, 'leer la versión encendida', currentVersionScript(settings.baseDir)).stdout,
  );
  const redeploy = previous === settings.version;
  const fallback = redeploy ? undefined : previous;
  deps.print(`Desplegando ${settings.version} (encendida: ${previous ?? 'ninguna'}).\n`);

  let outcome: DeployOutcome;
  try {
    login(remote, settings.registryLogin);
    prepare(deps, settings, previous);
    outcome = { ...(await deployPrepared(deps, settings, fallback)), previous };
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;
    outcome = { result: 'failed', version: settings.version, previous, reason: error.message };
  } finally {
    logout(remote, settings.registryLogin);
  }
  record(deps, settings.baseDir, outcome);
  if (outcome.result === 'deployed') cleanUp(remote, settings, fallback);
  return outcome;
}

/** Resumen para el registro de GitHub. */
export function describeOutcome(outcome: DeployOutcome, where = 'pruebas'): string {
  if (outcome.result === 'deployed') {
    return `Versión ${outcome.version} publicada en ${where}.\n`;
  }
  const reason = tail(outcome.reason ?? '', 40);
  if (outcome.result === 'rolled_back') {
    return `La versión ${outcome.version} NO pasó las pruebas y se volvió sola a ${outcome.previous ?? '?'}.\nMotivo: ${reason}\n`;
  }
  return `El despliegue de ${outcome.version} falló.\nMotivo: ${reason}\n`;
}
