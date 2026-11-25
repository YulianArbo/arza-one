// Pruebas de humo de producción (B44, numerales 10.4 y 10.6). Desde fuera, por internet y con
// TLS, como lo haría una persona. Sin contraseña adicional: producción es pública. Si una falla
// después de varios intentos, el despliegue vuelve solo a la versión anterior.
import {
  answered,
  json,
  runChecks,
  statusSchema,
  versionSchema,
  type Check,
  type Fetch,
  type SmokeDependencies,
} from './smoke.ts';

export interface ProductionSmokeSettings {
  /** Dominio raíz, por ejemplo arzatech.co: las direcciones son www., app., clientes. y api. */
  readonly domain: string;
  /** Versión que debe reportar la API (vX.Y.Z). */
  readonly version: string;
}

type Get = (url: string) => Promise<Response>;

function getter(fetch: Fetch): Get {
  return (url) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
}

async function redirectsTo(get: Get, from: string, to: string): Promise<string | undefined> {
  const response = await get(from);
  const location = response.headers.get('location') ?? '';
  const target = URL.parse(location, from);
  const expected = new URL(to);
  const redirect = response.status >= 300 && response.status < 400 && location !== '';
  return redirect && target?.origin === expected.origin && target.pathname === expected.pathname
    ? undefined
    : `respondió ${String(response.status)} hacia «${location}»`;
}

async function healthy(get: Get, url: string): Promise<string | undefined> {
  const response = await get(url);
  const body = statusSchema.safeParse(await json(response));
  const status = body.success ? body.data.status : '?';
  return response.status === 200 && status === 'ok'
    ? undefined
    : `respondió ${String(response.status)} con estado «${status}»`;
}

async function strictTransport(get: Get, url: string): Promise<string | undefined> {
  const response = await get(url);
  const hsts = response.headers.get('strict-transport-security') ?? '';
  return hsts.includes('max-age=') ? undefined : 'falta la cabecera Strict-Transport-Security';
}

async function expectedVersion(get: Get, api: string, version: string) {
  const body = versionSchema.safeParse(await json(await get(`${api}/version`)));
  if (!body.success) return 'la respuesta de /version no es válida';
  const { commit, environment } = body.data;
  return commit === version && environment === 'production'
    ? undefined
    : `reporta ${commit} en «${environment}»`;
}

async function monitorClosed(get: Get, api: string): Promise<string | undefined> {
  const response = await get(`${api}/ops/status`);
  return response.status === 401 ? undefined : answered(response, 401);
}

function productionChecks(settings: ProductionSmokeSettings, fetch: Fetch): Check[] {
  const get = getter(fetch);
  const { domain, version } = settings;
  const www = `https://www.${domain}`;
  const api = `https://api.${domain}`;
  const list: [string, () => Promise<string | undefined>][] = [
    ['HTTP redirige a HTTPS', () => redirectsTo(get, `http://www.${domain}/`, www)],
    ['El dominio sin www lleva al sitio', () => redirectsTo(get, `https://${domain}/`, www)],
    ['El sitio público está vivo', () => healthy(get, `${www}/healthz`)],
    ['El sitio exige HTTPS en adelante (HSTS)', () => strictTransport(get, `${www}/healthz`)],
    [
      'app. abre la aplicación interna',
      () => redirectsTo(get, `https://app.${domain}/`, `https://app.${domain}/app`),
    ],
    [
      'clientes. abre el portal del cliente',
      () => redirectsTo(get, `https://clientes.${domain}/`, `https://clientes.${domain}/portal`),
    ],
    ['La API responde con base de datos, colas y archivos', () => healthy(get, `${api}/health`)],
    ['La API publicada es la versión aprobada', () => expectedVersion(get, api, version)],
    ['Las cifras de los vigilantes piden su llave', () => monitorClosed(get, api)],
  ];
  return list.map(([name, run]) => ({ name, run }));
}

export function runProductionSmokeTests(
  settings: ProductionSmokeSettings,
  deps: SmokeDependencies,
  attempts?: number,
): Promise<string[]> {
  return runChecks(productionChecks(settings, deps.fetch), deps, attempts);
}
