import { describe, expect, it } from 'vitest';

import { loadProductionEnv } from './production-config.ts';
import { DeployError } from './remote.ts';
import { runProductionSmokeTests } from './smoke-production.ts';
import type { Fetch } from './smoke.ts';

const SETTINGS = { domain: 'arza.test', version: 'v1.2.3' };
const HSTS = { 'Strict-Transport-Security': 'max-age=31536000' };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}

type Answers = Record<string, () => Response>;

/** Producción sana: cuatro direcciones, TLS en adelante y /ops cerrado sin llave. */
const HEALTHY: Answers = {
  'http://www.arza.test/': () => redirect('https://www.arza.test/'),
  'https://arza.test/': () => redirect('https://www.arza.test/'),
  'https://www.arza.test/healthz': () => json({ status: 'ok' }, 200, HSTS),
  'https://app.arza.test/': () => redirect('https://app.arza.test/app'),
  'https://clientes.arza.test/': () => redirect('https://clientes.arza.test/portal'),
  'https://api.arza.test/health': () => json({ status: 'ok' }),
  'https://api.arza.test/version': () =>
    json({ version: '0.1.0', environment: 'production', commit: 'v1.2.3' }),
  'https://api.arza.test/ops/status': () => json({ error: { code: 'UNAUTHENTICATED' } }, 401),
};

function server(overrides: Answers = {}): Fetch {
  const answers = { ...HEALTHY, ...overrides };
  return (url) => {
    const answer = answers[url];
    return answer === undefined
      ? Promise.reject(new Error(`sin respuesta para ${url}`))
      : Promise.resolve(answer());
  };
}

const deps = (fetch: Fetch) => ({
  fetch,
  sleep: () => Promise.resolve(),
  print: () => undefined,
});

describe('pruebas de humo de producción (B44)', () => {
  it('pasan en una producción sana', async () => {
    await expect(runProductionSmokeTests(SETTINGS, deps(server()), 1)).resolves.toEqual([]);
  });

  it('fallan si la API publicada no es la versión aprobada o no es producción', async () => {
    const staging = server({
      'https://api.arza.test/version': () =>
        json({ version: '0.1.0', environment: 'staging', commit: 'v1.2.3' }),
    });
    const failures = await runProductionSmokeTests(SETTINGS, deps(staging), 1);
    expect(failures).toEqual([expect.stringContaining('reporta v1.2.3 en «staging»')]);
  });

  it('fallan si las cifras de los vigilantes quedan abiertas sin llave', async () => {
    const open = server({ 'https://api.arza.test/ops/status': () => json({ status: 'ok' }) });
    const failures = await runProductionSmokeTests(SETTINGS, deps(open), 1);
    expect(failures).toEqual([expect.stringContaining('respondió 200 en lugar de 401')]);
  });

  it('fallan sin HSTS o si app. no lleva a la aplicación', async () => {
    const broken = server({
      'https://www.arza.test/healthz': () => json({ status: 'ok' }),
      'https://app.arza.test/': () => json({}, 200),
    });
    const failures = await runProductionSmokeTests(SETTINGS, deps(broken), 1);
    expect(failures).toHaveLength(2);
  });
});

describe('datos del despliegue a producción', () => {
  const BASE = {
    PRODUCTION_HOST: '203.0.113.20',
    PRODUCTION_DOMAIN: 'arzatech.co',
    APP_VERSION: 'v1.0.0',
    IMAGE_REGISTRY: 'ghcr.io/arza',
  };

  it('toma los valores por omisión y no publica fuera de la ventana sin declararlo', () => {
    expect(loadProductionEnv(BASE)).toMatchObject({
      PRODUCTION_TARGET: 'ssh',
      PRODUCTION_SSH_USER: 'deploy',
      PRODUCTION_BASE_DIR: '/srv/arza-one',
      URGENT_SECURITY_FIX: '0',
    });
  });

  it('solo acepta versiones etiquetadas vX.Y.Z', () => {
    expect(() => loadProductionEnv({ ...BASE, APP_VERSION: 'b07aaaa' })).toThrow(
      /APP_VERSION: producción solo publica versiones vX\.Y\.Z/,
    );
  });

  it('exige la dirección del servidor, salvo en el ensayo local', () => {
    const withoutHost = { ...BASE, PRODUCTION_HOST: '' };
    expect(() => loadProductionEnv(withoutHost)).toThrow(DeployError);
    expect(
      loadProductionEnv({ ...withoutHost, PRODUCTION_TARGET: 'local' }).PRODUCTION_TARGET,
    ).toBe('local');
  });
});
