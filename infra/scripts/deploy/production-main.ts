// Uso (GitHub Actions, B44): node infra/scripts/deploy/production-main.ts <festivos.json>
// Despliega la versión etiquetada APP_VERSION en producción y vuelve sola a la anterior si las
// pruebas de humo fallan (numeral 10.6). Antes revisa la ventana de publicación: festivos.json
// trae las fechas de los festivos de Colombia (aaaa-mm-dd), calculadas por el módulo Núcleo.
// Termina con código 1 si la versión no quedó publicada.
import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { registryHost } from './config.ts';
import { deploy, describeOutcome, type DeployDependencies, type DeploySettings } from './deploy.ts';
import { createBundle, localRemote, sshRemote, trustCaddyLocalCa } from './deploy-runner.ts';
import { loadProductionEnv, type ProductionEnv } from './production-config.ts';
import { releaseWindowProblem } from './release-window.ts';
import type { Target } from './release.ts';
import { DeployError, type Remote } from './remote.ts';
import { runProductionSmokeTests } from './smoke-production.ts';

const print = (message: string): void => {
  process.stdout.write(message);
};

const holidaysSchema = z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

function target(env: ProductionEnv): Target {
  return { baseDir: env.PRODUCTION_BASE_DIR, environment: 'production' };
}

function remoteFor(env: ProductionEnv): Remote {
  if (env.PRODUCTION_TARGET === 'local') return localRemote;
  return sshRemote({
    host: env.PRODUCTION_HOST ?? '',
    user: env.PRODUCTION_SSH_USER,
    port: env.PRODUCTION_SSH_PORT,
  });
}

/** Fuera de la ventana solo pasa una corrección urgente de seguridad, y queda dicho. */
function checkWindow(env: ProductionEnv, holidaysFile: string | undefined): void {
  if (holidaysFile === undefined) throw new DeployError('Falta el archivo de festivos.');
  const holidays = new Set(holidaysSchema.parse(JSON.parse(readFileSync(holidaysFile, 'utf8'))));
  const problem = releaseWindowProblem(new Date(), holidays);
  if (problem === undefined) return;
  if (env.URGENT_SECURITY_FIX === '1') {
    print(`Fuera de la ventana (${problem}); se publica por corrección urgente de seguridad.\n`);
    return;
  }
  throw new DeployError(
    `Fuera de la ventana de publicación: ${problem}. Solo una corrección urgente de seguridad ` +
      'puede publicarse ahora (numeral 10.6).',
  );
}

function dependencies(env: ProductionEnv, remote: Remote): DeployDependencies {
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  const trustLocalCa = (version: string): void => {
    trustCaddyLocalCa(remote, target(env), version);
  };
  return {
    remote,
    smoke: (version) =>
      runProductionSmokeTests({ domain: env.PRODUCTION_DOMAIN, version }, { fetch, print, sleep }),
    ...(env.PRODUCTION_TRUST_LOCAL_CA === '1' ? { beforeSmoke: trustLocalCa } : {}),
    print,
    now: () => new Date(),
  };
}

function settings(env: ProductionEnv): DeploySettings {
  const login =
    env.REGISTRY_USER !== undefined && env.REGISTRY_TOKEN !== undefined
      ? {
          registryLogin: {
            host: registryHost(env.IMAGE_REGISTRY),
            user: env.REGISTRY_USER,
            token: env.REGISTRY_TOKEN,
          },
        }
      : {};
  return {
    version: env.APP_VERSION,
    registry: env.IMAGE_REGISTRY,
    ...target(env),
    bundle: createBundle('production'),
    ...login,
  };
}

async function main(): Promise<void> {
  const env = loadProductionEnv(process.env);
  checkWindow(env, process.argv[2]);
  const outcome = await deploy(dependencies(env, remoteFor(env)), settings(env));
  print(`\n${describeOutcome(outcome, 'producción')}`);
  if (outcome.result !== 'deployed') process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  if (!(error instanceof DeployError)) throw error;
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
}
