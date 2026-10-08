import { describe, expect, it, vi } from 'vitest';

import { runSmokeTests, SMOKE_ATTEMPTS, SMOKE_INTERVAL_MS, type Fetch } from './smoke.ts';

const SETTINGS = {
  domain: 'pruebas.arza.test',
  user: 'revisor',
  password: 'clave-de-prueba',
  version: 'b07aaaa',
};
const AUTH = `Basic ${Buffer.from('revisor:clave-de-prueba').toString('base64')}`;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

type Answers = Record<string, () => Response>;

/** Un ambiente de pruebas sano, con la autenticación adicional exigida por Caddy. */
const HEALTHY: Answers = {
  'https://pruebas.arza.test/healthz': () => json({ status: 'ok' }),
  'https://pruebas.arza.test/api/health': () =>
    json({ status: 'ok', checks: { database: 'up', queues: 'up', files: 'up' } }),
  'https://pruebas.arza.test/api/version': () =>
    json({ version: '0.1.0', environment: 'staging', commit: 'b07aaaa' }),
  'https://correo.pruebas.arza.test/': () => new Response('', { status: 200 }),
  'http://pruebas.arza.test/': () =>
    new Response(null, { status: 308, headers: { Location: 'https://pruebas.arza.test/' } }),
};

function server(overrides: Answers = {}): Fetch {
  const answers = { ...HEALTHY, ...overrides };
  return (url, init) => {
    const headers = new Headers(init.headers);
    const answer = answers[url];
    if (answer === undefined) return Promise.reject(new Error(`sin respuesta para ${url}`));
    const protectedUrl = url.startsWith('https://');
    if (protectedUrl && headers.get('authorization') !== AUTH) {
      return Promise.resolve(
        new Response('', {
          status: 401,
          headers: { 'X-Robots-Tag': 'noindex, nofollow', 'WWW-Authenticate': 'Basic realm="x"' },
        }),
      );
    }
    return Promise.resolve(answer());
  };
}

function deps(fetch: Fetch): {
  fetch: Fetch;
  sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
  print: (message: string) => void;
  printed: string[];
} {
  const printed: string[] = [];
  return {
    fetch,
    sleep: vi.fn(() => Promise.resolve()),
    print: (message) => printed.push(message),
    printed,
  };
}

describe('pruebas de humo: intentos', () => {
  it('pasan en un ambiente sano, al primer intento', async () => {
    const d = deps(server());
    await expect(runSmokeTests(SETTINGS, d)).resolves.toEqual([]);
    expect(d.sleep).not.toHaveBeenCalled();
    expect(d.printed.join('')).toContain('Pruebas de humo superadas (6 de 6)');
  });

  it('reintentan mientras Caddy obtiene el certificado y luego pasan', async () => {
    let calls = 0;
    const fetch: Fetch = (url, init) => {
      calls += 1;
      return calls <= 6
        ? Promise.reject(new Error('certificado aún no listo'))
        : server()(url, init);
    };
    const d = deps(fetch);
    await expect(runSmokeTests(SETTINGS, d)).resolves.toEqual([]);
    expect(d.sleep).toHaveBeenCalledTimes(1);
    expect(d.sleep).toHaveBeenCalledWith(SMOKE_INTERVAL_MS);
  });

  it('se rinden después de todos los intentos y dicen qué falló', async () => {
    const d = deps(server({ 'https://pruebas.arza.test/api/health': () => json({}, 503) }));
    const failures = await runSmokeTests(SETTINGS, d);
    expect(failures).toEqual([
      'La API responde con base de datos, colas y archivos: respondió 503 con estado «?»',
    ]);
    expect(d.sleep).toHaveBeenCalledTimes(SMOKE_ATTEMPTS - 1);
    expect(d.printed.join('')).toContain('Pruebas de humo fallidas');
  });
});

describe('pruebas de humo: piezas que no responden', () => {
  it('fallan si la API responde degradada', async () => {
    const degraded = (): Response => json({ status: 'degraded' }, 200);
    const failures = await runSmokeTests(
      SETTINGS,
      deps(server({ 'https://pruebas.arza.test/api/health': degraded })),
      1,
    );
    expect(failures[0]).toContain('estado «degraded»');
  });
});

describe('pruebas de humo: permiso denegado y protección del sitio', () => {
  it('fallan si el sitio deja entrar sin la contraseña adicional (permiso denegado)', async () => {
    const open: Fetch = (url) =>
      Promise.resolve(
        url.endsWith('/healthz') ? json({ status: 'ok' }) : (HEALTHY[url]?.() ?? json({}, 404)),
      );
    const failures = await runSmokeTests(SETTINGS, deps(open), 1);
    expect(failures).toContain(
      'Sin la contraseña adicional se niega la entrada y no se indexa: respondió 200 en lugar de 401',
    );
    expect(failures).toContain(
      'La bandeja de correo de pruebas también pide la contraseña: respondió 200 en lugar de 401',
    );
  });

  it('fallan si falta la cabecera que impide indexar el sitio', async () => {
    const fetch: Fetch = (url, init) =>
      new Headers(init.headers).has('authorization') || url.startsWith('http:')
        ? server()(url, init)
        : Promise.resolve(
            new Response('', { status: 401, headers: { 'WWW-Authenticate': 'Basic' } }),
          );
    const failures = await runSmokeTests(SETTINGS, deps(fetch), 1);
    expect(failures).toEqual([
      'Sin la contraseña adicional se niega la entrada y no se indexa: falta la cabecera X-Robots-Tag noindex',
    ]);
  });
});

describe('pruebas de humo: HTTPS obligatorio', () => {
  it('fallan si HTTP no redirige a HTTPS', async () => {
    const failures = await runSmokeTests(
      SETTINGS,
      deps(server({ 'http://pruebas.arza.test/': () => new Response('hola', { status: 200 }) })),
      1,
    );
    expect(failures).toEqual(['HTTP redirige a HTTPS: respondió 200 hacia «»']);
  });

  it('fallan si la redirección no va a HTTPS', async () => {
    const insecure = (): Response =>
      new Response(null, { status: 301, headers: { Location: 'http://otro.test/' } });
    const failures = await runSmokeTests(
      SETTINGS,
      deps(server({ 'http://pruebas.arza.test/': insecure })),
      1,
    );
    expect(failures).toEqual(['HTTP redirige a HTTPS: respondió 301 hacia «http://otro.test/»']);
  });
});

describe('pruebas de humo: la versión publicada', () => {
  it('fallan si la web no está viva', async () => {
    const failures = await runSmokeTests(
      SETTINGS,
      deps(
        server({ 'https://pruebas.arza.test/healthz': () => new Response('x', { status: 502 }) }),
      ),
      1,
    );
    expect(failures).toEqual(['La web está viva: respondió 502']);
  });

  it('fallan si la versión publicada no es la esperada (la anterior siguió encendida)', async () => {
    const old = (): Response =>
      json({ version: '0.1.0', environment: 'staging', commit: 'b06bbbb' });
    const failures = await runSmokeTests(
      SETTINGS,
      deps(server({ 'https://pruebas.arza.test/api/version': old })),
      1,
    );
    expect(failures).toEqual([
      'La API publicada es la versión esperada del ambiente de pruebas: reporta b06bbbb en «staging»',
    ]);
  });

  it('fallan si la API no es la del ambiente de pruebas o responde algo inválido', async () => {
    const local = (): Response => json({ environment: 'local', commit: 'b07aaaa' });
    const failures = await runSmokeTests(
      SETTINGS,
      deps(server({ 'https://pruebas.arza.test/api/version': local })),
      1,
    );
    expect(failures[0]).toContain('reporta b07aaaa en «local»');
    const invalid = await runSmokeTests(
      SETTINGS,
      deps(server({ 'https://pruebas.arza.test/api/version': () => new Response('<html>') })),
      1,
    );
    expect(invalid[0]).toContain('la respuesta de /version no es válida');
  });
});

describe('pruebas de humo: errores de conexión', () => {
  it('explican la causa de un error de conexión', async () => {
    const tlsError = new TypeError('fetch failed', {
      cause: new Error('unable to verify the first certificate'),
    });
    const failures = await runSmokeTests(
      SETTINGS,
      deps(() => Promise.reject(tlsError)),
      1,
    );
    expect(failures).toHaveLength(6);
    expect(failures[0]).toContain('unable to verify the first certificate');
    const plain = await runSmokeTests(
      SETTINGS,
      deps(() => Promise.reject(new Error('DNS sin respuesta'))),
      1,
    );
    expect(plain[0]).toContain('DNS sin respuesta');
  });
});

describe('pruebas de humo: la petición de contraseña', () => {
  it('fallan si el 401 no le pide la contraseña al navegador', async () => {
    const fetch: Fetch = (url, init) =>
      new Headers(init.headers).has('authorization') || url.startsWith('http:')
        ? server()(url, init)
        : Promise.resolve(
            new Response('', { status: 401, headers: { 'X-Robots-Tag': 'noindex, nofollow' } }),
          );
    const failures = await runSmokeTests(SETTINGS, deps(fetch), 1);
    expect(failures).toEqual([
      'Sin la contraseña adicional se niega la entrada y no se indexa: el navegador no recibe la petición de contraseña',
    ]);
  });
});
