// Uso (GitHub Actions, B07): node infra/scripts/deploy/deploy-main.ts
// Despliega APP_VERSION en el servidor de pruebas y vuelve sola a la anterior si algo falla.
// Termina con código 1 si la versión no quedó publicada (reversión o falla).
import { loadDeployEnv, registryHost, type DeployEnv } from './config.ts';
import { deploy, describeOutcome, type DeployDependencies, type DeploySettings } from './deploy.ts';
import { createBundle, localRemote, sshRemote, trustCaddyLocalCa } from './deploy-runner.ts';
import type { Target } from './release.ts';
import { DeployError, type Remote } from './remote.ts';
import { runSmokeTests } from './smoke.ts';

const print = (message: string): void => {
  process.stdout.write(message);
};

function remoteFor(env: DeployEnv): Remote {
  if (env.STAGING_TARGET === 'local') return localRemote;
  return sshRemote({
    host: env.STAGING_HOST ?? '',
    user: env.STAGING_SSH_USER,
    port: env.STAGING_SSH_PORT,
  });
}

function target(env: DeployEnv): Target {
  return { baseDir: env.STAGING_BASE_DIR, environment: 'staging' };
}

function dependencies(env: DeployEnv, remote: Remote): DeployDependencies {
  const smokeSettings = {
    domain: env.STAGING_DOMAIN,
    user: env.STAGING_AUTH_USER,
    password: env.STAGING_AUTH_PASSWORD,
  };
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  const trustLocalCa = (version: string): void => {
    trustCaddyLocalCa(remote, target(env), version);
  };
  return {
    remote,
    smoke: (version) => runSmokeTests({ ...smokeSettings, version }, { fetch, print, sleep }),
    ...(env.STAGING_TRUST_LOCAL_CA === '1' ? { beforeSmoke: trustLocalCa } : {}),
    print,
    now: () => new Date(),
  };
}

function settings(env: DeployEnv): DeploySettings {
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
    bundle: createBundle('staging'),
    ...login,
  };
}

async function main(): Promise<void> {
  const env = loadDeployEnv(process.env);
  const outcome = await deploy(dependencies(env, remoteFor(env)), settings(env));
  print(`\n${describeOutcome(outcome)}`);
  if (outcome.result !== 'deployed') process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  if (!(error instanceof DeployError)) throw error;
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
}
