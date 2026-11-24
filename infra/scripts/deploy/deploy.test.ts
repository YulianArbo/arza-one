import { describe, expect, it, vi } from 'vitest';

import { deploy, type DeployDependencies, type DeploySettings } from './deploy.ts';
import { failed, fakeServer, ok, type FakeServer, type Rule } from './fake-server.ts';

const NEW = 'b07aaaa';
const OLD = 'b06bbbb';
const SETTINGS: DeploySettings = {
  version: NEW,
  registry: 'ghcr.io/arza-tech',
  baseDir: '/srv/arza-one',
  environment: 'staging',
  bundle: Buffer.from('archivos'),
};
const NOW = new Date('2026-10-08T15:04:05.000Z');

interface Harness {
  readonly server: FakeServer;
  readonly deps: DeployDependencies;
  readonly printed: string[];
  readonly smoke: ReturnType<typeof vi.fn<(version: string) => Promise<string[]>>>;
}

function harness(
  options: {
    rules?: Rule[];
    current?: string;
    smoke?: (version: string) => Promise<string[]>;
  } = {},
): Harness {
  const server = fakeServer(options.rules, options.current ?? '');
  const printed: string[] = [];
  const smoke = vi.fn(options.smoke ?? (() => Promise.resolve([])));
  const deps: DeployDependencies = {
    remote: server.remote,
    smoke,
    print: (message) => printed.push(message),
    now: () => NOW,
  };
  return { server, deps, printed, smoke };
}

/** Línea registrada en deployments.log. */
function logged(server: FakeServer): unknown {
  const index = server.scripts.findIndex((script) => script.includes('deployments.log'));
  return JSON.parse(String(server.inputs[index]));
}

describe('despliegue: camino feliz', () => {
  it('primera versión: prepara todo, enciende, prueba y registra', async () => {
    const { server, deps, smoke } = harness();
    const outcome = await deploy(deps, SETTINGS);

    expect(outcome).toEqual({ result: 'deployed', version: NEW });
    expect(smoke).toHaveBeenCalledWith(NEW);
    const order = [
      'tar -xzf - -C',
      'release.env',
      '--profile tools pull',
      'up --detach --wait --wait-timeout 300 postgres valkey garage',
      "'bucket' 'allow'",
      'run --rm migrate',
      'seed-main.js --demo',
      'current.next',
      'up --detach --remove-orphans',
      'rolbypassrls',
      'deployments.log',
    ].map((fragment) => server.scripts.findIndex((script) => script.includes(fragment)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(logged(server)).toEqual({ at: NOW.toISOString(), result: 'deployed', version: NEW });
  });

  it('sin versión anterior no copia la base (todavía no hay datos)', async () => {
    const { server, deps } = harness();
    await deploy(deps, SETTINGS);
    expect(server.matching('pg_dump')).toEqual([]);
  });

  it('con versión anterior copia la base antes de migrar y conserva las 10 más recientes', async () => {
    const { server, deps } = harness({ current: OLD });
    const outcome = await deploy(deps, SETTINGS);

    expect(outcome).toEqual({ result: 'deployed', version: NEW, previous: OLD });
    const [dump] = server.matching('pg_dump');
    expect(dump).toContain(`/srv/arza-one/backups/20261008T150405Z-antes-de-${NEW}.dump`);
    expect(dump).toContain('tail -n +11');
    expect(server.scripts.indexOf(dump ?? '')).toBeLessThan(
      server.scripts.findIndex((script) => script.includes('run --rm migrate')),
    );
  });
});

describe('despliegue: archivos, llaves y registro', () => {
  it('usa los archivos de la versión nueva y las contraseñas del servidor', async () => {
    const { server, deps } = harness();
    await deploy(deps, SETTINGS);
    const [up] = server.matching('up --detach --remove-orphans');
    expect(up).toContain("--file '/srv/arza-one/releases/b07aaaa/infra/compose/staging.yml'");
    expect(up).toContain("--env-file '/srv/arza-one/.env'");
    expect(up).toContain("--env-file '/srv/arza-one/releases/b07aaaa/release.env'");
    expect(up).toContain('--project-name arza-one-staging');
    const releaseIndex = server.scripts.findIndex((script) => script.includes('release.env'));
    expect(server.inputs[releaseIndex]).toBe(
      'APP_VERSION=b07aaaa\nIMAGE_REGISTRY=ghcr.io/arza-tech\n',
    );
    expect(server.inputs[0]).toBeUndefined();
    expect(server.inputs).toContain(SETTINGS.bundle);
  });

  it('las llaves de Garage se leen en el servidor: nunca viajan desde GitHub', async () => {
    const { server, deps } = harness({
      rules: [{ fragment: "'key' 'info'", answer: failed('no existe') }],
    });
    await deploy(deps, SETTINGS);
    const [importKey] = server.matching("'key' 'import'");
    expect(importKey).toContain(". '/srv/arza-one/.env'");
    expect(importKey).toContain('"${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"');
  });

  it('entra al registro con el token por la entrada estándar y sale al terminar', async () => {
    const { server, deps } = harness();
    const registryLogin = { host: 'ghcr.io', user: 'robot', token: 'token-de-prueba' };
    await deploy(deps, { ...SETTINGS, registryLogin });

    const loginIndex = server.scripts.findIndex((script) => script.includes('docker login'));
    expect(server.scripts[loginIndex]).toContain('--password-stdin');
    expect(server.scripts[loginIndex]).not.toContain('token-de-prueba');
    expect(server.inputs[loginIndex]).toBe('token-de-prueba');
    expect(server.matching("docker logout 'ghcr.io'")).toHaveLength(1);
  });
});

describe('despliegue: certificado, limpieza y repetición', () => {
  it('confía en el certificado del ensayo justo antes de las pruebas de humo', async () => {
    const calls: string[] = [];
    const { deps } = harness({
      smoke: () => {
        calls.push('smoke');
        return Promise.resolve([]);
      },
    });
    await deploy({ ...deps, beforeSmoke: (version) => calls.push(`ca:${version}`) }, SETTINGS);
    expect(calls).toEqual([`ca:${NEW}`, 'smoke']);
  });

  it('al terminar borra versiones viejas, nunca la nueva ni la anterior', async () => {
    const { server, deps } = harness({ current: OLD });
    await deploy(deps, SETTINGS);
    const [cleanUp] = server.matching('xargs -r -I{} rm -rf');
    expect(cleanUp).toContain(`grep -v -e '^${NEW}$' -e '^${OLD}$'`);
    expect(cleanUp).toContain('tail -n +4');
    expect(cleanUp).toContain('docker image prune --all --force --filter until=720h');
  });

  it('volver a desplegar la versión encendida no la toma como anterior', async () => {
    const { deps, server } = harness({ current: NEW });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome).toEqual({ result: 'deployed', version: NEW, previous: NEW });
    expect(server.matching('pg_dump')).toHaveLength(1);
  });
});

describe('despliegue: reversión automática', () => {
  it('si fallan las pruebas de humo vuelve sola a la versión anterior', async () => {
    const { server, deps, smoke } = harness({
      current: OLD,
      smoke: (version) => Promise.resolve(version === NEW ? ['La API responde: 503'] : []),
    });
    const outcome = await deploy(deps, SETTINGS);

    expect(outcome).toMatchObject({ result: 'rolled_back', version: NEW, previous: OLD });
    expect(outcome.reason).toContain('La API responde: 503');
    expect(smoke.mock.calls).toEqual([[NEW], [OLD]]);
    const switches = server.matching('current.next');
    expect(switches.at(-1)).toContain(`'/srv/arza-one/releases/${OLD}'`);
    const ups = server.matching('up --detach --remove-orphans');
    expect(ups.at(-1)).toContain(`/releases/${OLD}/infra/compose/staging.yml`);
    expect(logged(server)).toMatchObject({ result: 'rolled_back', previous: OLD });
    expect(server.matching('xargs -r -I{} rm -rf')).toEqual([]);
  });
});

describe('despliegue: reversión por otras causas', () => {
  it('si la versión nueva no enciende también vuelve a la anterior', async () => {
    const { deps } = harness({
      current: OLD,
      rules: [
        {
          fragment: `releases/${NEW}/infra/compose/staging.yml' --env-file '/srv/arza-one/.env' --env-file '/srv/arza-one/releases/${NEW}/release.env' up --detach --remove-orphans`,
          answer: failed('container arza-one-staging-api-1 is unhealthy'),
        },
      ],
    });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome.result).toBe('rolled_back');
    expect(outcome.reason).toContain('encender la versión');
    expect(outcome.reason).toContain('unhealthy');
  });

  it('si falla el aislamiento entre empresas también vuelve a la anterior', async () => {
    const { deps } = harness({
      current: OLD,
      rules: [
        {
          fragment: 'rolbypassrls',
          answer: (script) =>
            script.includes(`/releases/${NEW}/`)
              ? ok('role=false,false\nnone=2\nown=2\nother=1\n')
              : ok('role=false,false\nnone=0\nown=1\nother=0\n'),
        },
      ],
    });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome.result).toBe('rolled_back');
    expect(outcome.reason).toContain('none=0, own=1, other=0');
  });
});

describe('despliegue: cuando no se puede volver', () => {
  it('si la reversión también falla lo dice claramente', async () => {
    const { deps, server } = harness({
      current: OLD,
      smoke: () => Promise.resolve(['La web está viva: respondió 502']),
    });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome.result).toBe('failed');
    expect(outcome.reason).toContain('La reversión también falló');
    expect(logged(server)).toMatchObject({ result: 'failed', previous: OLD });
  });

  it('una primera versión que falla queda como fallida (no hay a qué volver)', async () => {
    const { deps } = harness({ smoke: () => Promise.resolve(['La web está viva: 502']) });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome).toMatchObject({ result: 'failed', version: NEW });
    expect(outcome.previous).toBeUndefined();
  });
});

describe('despliegue: fallas antes de cambiar de versión', () => {
  it.each([
    ['descargar las imágenes', '--profile tools pull'],
    ['encender la base de datos, las colas y los archivos', 'postgres valkey garage'],
    ['copiar la base de datos antes de migrar', 'pg_dump'],
    ['aplicar las migraciones', 'run --rm migrate'],
    ['cargar los datos semilla', 'seed-main.js'],
  ])('si falla «%s» la versión anterior sigue encendida', async (step, fragment) => {
    const { server, deps, smoke } = harness({
      current: OLD,
      rules: [{ fragment, answer: failed('error del servidor') }],
    });
    const outcome = await deploy(deps, SETTINGS);

    expect(outcome).toMatchObject({ result: 'failed', version: NEW, previous: OLD });
    expect(outcome.reason).toContain(`Falló el paso «${step}»`);
    expect(outcome.reason).toContain('error del servidor');
    expect(server.matching('current.next')).toEqual([]);
    expect(smoke).not.toHaveBeenCalled();
    expect(logged(server)).toMatchObject({ result: 'failed' });
  });
});

describe('despliegue: Garage, registro y datos inválidos', () => {
  it('si Garage no se puede preparar, la versión anterior sigue encendida', async () => {
    const { deps, server } = harness({
      current: OLD,
      rules: [{ fragment: "'bucket' 'allow'", answer: failed('sin permiso') }],
    });
    const outcome = await deploy(deps, SETTINGS);
    expect(outcome.result).toBe('failed');
    expect(outcome.reason).toContain('dar permiso a la llave');
    expect(server.matching('current.next')).toEqual([]);
  });

  it('sale del registro aunque el despliegue falle', async () => {
    const { deps, server } = harness({
      rules: [{ fragment: 'pull', answer: failed('denied') }],
    });
    const registryLogin = { host: 'ghcr.io', user: 'robot', token: 'token-de-prueba' };
    await deploy(deps, { ...SETTINGS, registryLogin });
    expect(server.matching('docker logout')).toHaveLength(1);
  });

  it('si no puede leer la versión encendida no toca nada', async () => {
    const { deps, server } = harness({
      rules: [{ fragment: 'readlink', answer: failed('sin conexión') }],
    });
    await expect(deploy(deps, SETTINGS)).rejects.toThrow('leer la versión encendida');
    expect(server.scripts).toHaveLength(1);
  });

  it('rechaza versiones, registros o carpetas que no son seguros para bash', async () => {
    const { deps, server } = harness();
    await expect(deploy(deps, { ...SETTINGS, version: 'abc; rm -rf /' })).rejects.toThrow(
      'Versión no válida',
    );
    await expect(deploy(deps, { ...SETTINGS, registry: 'ghcr.io/$(id)' })).rejects.toThrow(
      'Registro de imágenes no válido',
    );
    await expect(deploy(deps, { ...SETTINGS, baseDir: 'relativa' })).rejects.toThrow(
      'Carpeta del servidor no válida',
    );
    expect(server.scripts).toEqual([]);
  });
});

describe('despliegue: errores inesperados del programa', () => {
  it('un error inesperado del programa no se disfraza de falla del servidor', async () => {
    const { deps } = harness({ current: OLD, smoke: () => Promise.reject(new TypeError('x')) });
    await expect(deploy(deps, SETTINGS)).rejects.toThrow(TypeError);
  });

  it('un error inesperado durante la preparación tampoco se disfraza', async () => {
    const { deps, server } = harness({ current: OLD });
    const brokenClock = (): Date => {
      throw new RangeError('reloj');
    };
    await expect(deploy({ ...deps, now: brokenClock }, SETTINGS)).rejects.toThrow(RangeError);
    expect(server.matching('current.next')).toEqual([]);
  });

  it('un error inesperado durante la reversión no se disfraza', async () => {
    const { deps } = harness({
      current: OLD,
      smoke: (version) =>
        version === NEW ? Promise.resolve(['falla']) : Promise.reject(new TypeError('y')),
    });
    await expect(deploy(deps, SETTINGS)).rejects.toThrow(TypeError);
  });
});
