import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * Qué tareas de la integración continua corren en un cambio (ADR-024). Ninguna verificación se
 * elimina: solo se evita repetir sobre el mismo código una que ya pasó, o correr pruebas de código
 * cuando el cambio es solo documentación.
 */
export interface CheckPlan {
  /** Tareas 1-3: formato, análisis, tipos y fronteras. */
  quality: boolean;
  /** Tareas 4, 5, 7, 8 y 9: pruebas, migraciones, imágenes y navegador. */
  tests: boolean;
  /** Tareas 11 y 12: ensayos de despliegue y de servidor. */
  rehearsals: boolean;
  /** Explicación en español para quien lee la ejecución. */
  reason: string;
}

export interface PlanInput {
  event: string;
  /** Variable CI_FULL_RUN del repositorio en «true»: todo corre siempre, como antes de ADR-024. */
  fullRun: boolean;
  /** Archivos cambiados frente a la versión anterior; null si no se pudo calcular. */
  changedFiles: readonly string[] | null;
  /** Solo en main: el commit es una fusión cuyo código ya pasó «Verificaciones» en su pull request. */
  verifiedMerge: boolean;
}

const INFRA_PREFIXES = ['infra/', '.github/'];
const INFRA_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'Dockerfile'];
const INFRA_ROOT_FILES = ['.nvmrc', '.dockerignore'];

/** Documentación: nada que compilar ni probar; Prettier y gitleaks la revisan igual. */
export function isDocumentation(path: string): boolean {
  return path.startsWith('docs/') || path.endsWith('.md');
}

/** Archivos de los que dependen las imágenes, el despliegue y el servidor (tareas 11 y 12). */
export function isInfrastructure(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return (
    INFRA_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    INFRA_FILES.includes(name) ||
    INFRA_ROOT_FILES.includes(path)
  );
}

function everything(reason: string): CheckPlan {
  return { quality: true, tests: true, rehearsals: true, reason };
}

export function planChecks(input: PlanInput): CheckPlan {
  if (input.fullRun) return everything('Variable CI_FULL_RUN activa: corren todas las tareas.');
  if (input.event === 'workflow_dispatch') return everything('Lanzada a mano: corren todas.');
  if (input.changedFiles === null) {
    return everything('No se pudo calcular qué cambió: corren todas por seguridad.');
  }
  const files = input.changedFiles;
  if (files.every(isDocumentation)) {
    return {
      quality: !input.verifiedMerge,
      tests: false,
      rehearsals: false,
      reason: 'Solo documentación: no hay código que probar.',
    };
  }
  if (input.event === 'push') {
    if (!input.verifiedMerge) return everything('Cambio en main sin verificación previa: todas.');
    return {
      quality: false,
      tests: false,
      rehearsals: true,
      reason: 'Fusión de un pull request ya verificado: corren los ensayos 11 y 12.',
    };
  }
  const rehearsals = files.some(isInfrastructure);
  return {
    quality: true,
    tests: true,
    rehearsals,
    reason: rehearsals
      ? 'Cambio de código e infraestructura: corren todas.'
      : 'Cambio de código: los ensayos 11 y 12 corren al fusionar a main.',
  };
}

/** ¿Alguna ejecución de la tarea «Verificaciones» terminó en verde? (respuesta de check-runs). */
export function hasPassingVerification(response: unknown): boolean {
  if (typeof response !== 'object' || response === null || !('check_runs' in response)) {
    return false;
  }
  const runs = response.check_runs;
  if (!Array.isArray(runs)) return false;
  return runs.some(
    (run: unknown) =>
      typeof run === 'object' &&
      run !== null &&
      'name' in run &&
      'conclusion' in run &&
      run.name === 'Verificaciones' &&
      run.conclusion === 'success',
  );
}

export interface PlanEnvironment {
  event: string;
  fullRun: string | undefined;
  baseSha: string;
  repoRoot: string;
  /** Consulta las tareas de un commit en GitHub; devuelve la respuesta JSON o null. */
  fetchCheckRuns: (sha: string) => Promise<unknown>;
}

function git(repoRoot: string, args: readonly string[]): string | null {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function listChangedFiles(repoRoot: string, baseSha: string): string[] | null {
  if (/^0+$/.test(baseSha)) return null;
  const output = git(repoRoot, ['diff', '--name-only', '--no-renames', baseSha, 'HEAD']);
  return output === null ? null : output.split('\n').filter((line) => line !== '');
}

/**
 * Una fusión está verificada si su segundo padre (la punta del pull request) tiene exactamente el
 * mismo código que la fusión (la rama estaba al día con main) y su tarea «Verificaciones» pasó.
 */
async function isVerifiedMerge(env: PlanEnvironment): Promise<boolean> {
  const parents = git(env.repoRoot, ['rev-list', '--parents', '-n', '1', 'HEAD'])?.split(' ');
  const head = parents?.[2];
  if (parents?.length !== 3 || head === undefined) return false;
  const mergeTree = git(env.repoRoot, ['rev-parse', 'HEAD^{tree}']);
  const headTree = git(env.repoRoot, ['rev-parse', `${head}^{tree}`]);
  if (mergeTree === null || mergeTree !== headTree) return false;
  return hasPassingVerification(await env.fetchCheckRuns(head));
}

async function resolvePlan(env: PlanEnvironment): Promise<CheckPlan> {
  const verifiedMerge = env.event === 'push' && (await isVerifiedMerge(env));
  return planChecks({
    event: env.event,
    fullRun: env.fullRun === 'true',
    changedFiles: listChangedFiles(env.repoRoot, env.baseSha),
    verifiedMerge,
  });
}

/** Líneas para el archivo GITHUB_OUTPUT de la tarea. */
export function formatOutputs(plan: CheckPlan): string {
  return [
    `quality=${String(plan.quality)}`,
    `tests=${String(plan.tests)}`,
    `rehearsals=${String(plan.rehearsals)}`,
    '',
  ].join('\n');
}

export async function runCheckPlan(env: PlanEnvironment, outputFile: string): Promise<number> {
  const plan = await resolvePlan(env);
  process.stdout.write(
    `${plan.reason}\nFormato y análisis: ${plan.quality ? 'sí' : 'no'} · ` +
      `Pruebas, migraciones, imágenes y navegador: ${plan.tests ? 'sí' : 'no'} · ` +
      `Ensayos 11 y 12: ${plan.rehearsals ? 'sí' : 'no'} · Seguridad: sí\n`,
  );
  appendFileSync(outputFile, formatOutputs(plan));
  return 0;
}
