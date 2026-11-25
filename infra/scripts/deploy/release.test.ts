import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadDeployEnv, registryHost } from './config.ts';
import {
  PROFILES,
  compose,
  currentVersionScript,
  parseVersion,
  switchScript,
  validateRelease,
} from './release.ts';
import { DeployError, required, shellQuote, sshArgs, tail } from './remote.ts';
import { fakeServer, failed } from './fake-server.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const bash = (script: string): string => execFileSync('bash', ['-c', script], { encoding: 'utf8' });

describe('órdenes al servidor', () => {
  it('las comillas de bash dejan pasar cualquier texto literal', () => {
    const tricky = `a'b "$HOME" $(id) \`id\``;
    expect(bash(`printf %s ${shellQuote(tricky)}`)).toBe(tricky);
  });

  it('ssh solo con llave, contra un servidor conocido y con el guion entre comillas', () => {
    const args = sshArgs({ host: '203.0.113.10', user: 'deploy', port: 22 }, "echo 'hola'");
    expect(args).toEqual(
      expect.arrayContaining(['BatchMode=yes', 'StrictHostKeyChecking=yes', 'deploy@203.0.113.10']),
    );
    expect(args.at(-1)).toBe(`bash -c 'echo '\\''hola'\\'''`);
  });

  it('un paso obligatorio que falla detiene con su nombre y el final del error', () => {
    const server = fakeServer([{ fragment: 'pull', answer: failed('denied: token vencido') }]);
    expect(() => required(server.remote, 'descargar', 'docker pull')).toThrow(
      new DeployError('Falló el paso «descargar».\ndenied: token vencido'),
    );
    expect(() =>
      required(fakeServer([{ fragment: 'x', answer: failed('') }]).remote, 'p', 'x'),
    ).toThrow(new DeployError('Falló el paso «p».'));
    expect(server.scripts[0]).toBe('set -euo pipefail\ndocker pull');
  });

  it('del error solo muestra las últimas líneas', () => {
    const long = Array.from({ length: 30 }, (_, index) => `línea ${String(index)}`).join('\n');
    expect(tail(long).split('\n')).toHaveLength(15);
    expect(tail(long, 2)).toBe('línea 28\nlínea 29');
  });
});

describe('versiones en el servidor', () => {
  it('acepta commits y etiquetas vX.Y.Z', () => {
    const staging = {
      registry: 'ghcr.io/arza',
      baseDir: '/srv/arza-one',
      environment: 'staging',
    } as const;
    for (const version of ['b07aaaa', 'a'.repeat(40), 'v1.2.3']) {
      expect(() => validateRelease({ version, ...staging })).not.toThrow();
    }
    const local = {
      registry: 'localhost:5000',
      baseDir: '/srv/a',
      environment: 'production',
    } as const;
    expect(() => validateRelease({ version: 'b07aaaa', ...local })).not.toThrow();
  });

  // Git Bash en Windows copia en lugar de crear enlaces simbólicos: corre en Linux (GitHub).
  it.skipIf(process.platform === 'win32')(
    'el enlace current cambia de versión de forma atómica',
    () => {
      const dir = bash('mktemp -d').trim();
      try {
        for (const version of ['b06bbbb', 'b07aaaa']) {
          bash(`mkdir -p ${dir}/releases/${version}\n${switchScript(dir, version)}`);
        }
        expect(parseVersion(bash(currentVersionScript(dir)))).toBe('b07aaaa');
        expect(bash(`ls ${dir}`).trim().split('\n')).toEqual(['current', 'releases']);
      } finally {
        bash(`rm -rf ${dir}`);
      }
    },
  );

  it('sin despliegues previos no hay versión encendida', () => {
    expect(parseVersion(bash(currentVersionScript('/ruta/que/no/existe')))).toBeUndefined();
    expect(parseVersion('basura\n')).toBeUndefined();
  });
});

describe('archivos de cada versión', () => {
  it('docker compose usa el proyecto fijo, la versión y las contraseñas del servidor', () => {
    expect(compose({ baseDir: '/srv/arza-one', environment: 'staging' }, 'b07aaaa', 'ps')).toBe(
      "docker compose --project-name arza-one-staging --file '/srv/arza-one/releases/b07aaaa/infra/compose/staging.yml' --env-file '/srv/arza-one/.env' --env-file '/srv/arza-one/releases/b07aaaa/release.env' ps",
    );
  });

  it('producción usa su propio proyecto y su propio archivo de servicios (B44)', () => {
    const target = { baseDir: '/srv/arza-one', environment: 'production' } as const;
    expect(compose(target, 'v1.0.0', 'ps')).toBe(
      "docker compose --project-name arza-one-production --file '/srv/arza-one/releases/v1.0.0/infra/compose/production.yml' --env-file '/srv/arza-one/.env' --env-file '/srv/arza-one/releases/v1.0.0/release.env' ps",
    );
    expect(PROFILES.production.demoData).toBe(false);
    expect(PROFILES.production.appServices).not.toContain('mailpit');
  });

  it('los archivos que viajan con cada versión existen en el repositorio', () => {
    for (const profile of Object.values(PROFILES)) {
      for (const path of profile.bundlePaths) expect(existsSync(`${REPO}${path}`), path).toBe(true);
    }
  });

  it('el ensayo y el servidor usan la misma imagen de Caddy que el compose', () => {
    const composeFile = readFileSync(`${REPO}infra/compose/staging.yml`, 'utf8');
    const envScript = readFileSync(`${REPO}infra/server/generate-env.sh`, 'utf8');
    const image = /caddy:[^\s]+@sha256:[0-9a-f]{64}/.exec(composeFile)?.[0];
    expect(image).toBeDefined();
    expect(envScript).toContain(`CADDY_IMAGE="${image ?? ''}"`);
  });
});

const BASE = {
  STAGING_HOST: '203.0.113.10',
  STAGING_DOMAIN: 'pruebas.arza.test',
  STAGING_AUTH_USER: 'revisor',
  STAGING_AUTH_PASSWORD: 'clave-de-prueba',
  APP_VERSION: 'b07aaaa',
  IMAGE_REGISTRY: 'ghcr.io/arza',
};

describe('datos del despliegue', () => {
  it('aplica los valores por defecto del servidor', () => {
    expect(loadDeployEnv(BASE)).toMatchObject({
      STAGING_TARGET: 'ssh',
      STAGING_SSH_USER: 'deploy',
      STAGING_SSH_PORT: 22,
      STAGING_BASE_DIR: '/srv/arza-one',
      STAGING_TRUST_LOCAL_CA: '0',
    });
  });

  it('las variables vacías de GitHub cuentan como ausentes', () => {
    expect(loadDeployEnv({ ...BASE, REGISTRY_USER: '', STAGING_SSH_PORT: '' })).toMatchObject({
      STAGING_SSH_PORT: 22,
    });
    expect(loadDeployEnv({ ...BASE, REGISTRY_USER: '' }).REGISTRY_USER).toBeUndefined();
  });

  it('explica qué falta, sin mostrar valores', () => {
    expect(() =>
      loadDeployEnv({ ...BASE, STAGING_AUTH_PASSWORD: '', STAGING_DOMAIN: 'Mal Dominio' }),
    ).toThrow(/STAGING_DOMAIN: solo minúsculas[\s\S]*STAGING_AUTH_PASSWORD/);
  });

  it('por SSH exige la dirección del servidor; en el ensayo no', () => {
    const withoutHost = { ...BASE, STAGING_HOST: undefined };
    expect(() => loadDeployEnv(withoutHost)).toThrow('Falta STAGING_HOST');
    expect(loadDeployEnv({ ...withoutHost, STAGING_TARGET: 'local' }).STAGING_TARGET).toBe('local');
  });

  it('el registro es la primera parte de la dirección de las imágenes', () => {
    expect(registryHost('ghcr.io/yulianarbo')).toBe('ghcr.io');
    expect(registryHost('localhost:5000')).toBe('localhost:5000');
  });
});
