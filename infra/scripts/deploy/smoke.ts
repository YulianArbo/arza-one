// Pruebas de humo del ambiente de pruebas (B07, numeral 10.6). Se hacen desde fuera del servidor,
// como lo haría una persona: por internet, con TLS y con la autenticación adicional.
// Si una falla después de varios intentos, el despliegue vuelve a la versión anterior.
import { z } from 'zod';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface SmokeSettings {
  readonly domain: string;
  readonly user: string;
  readonly password: string;
  /** Versión que debe reportar la API (commit desplegado). */
  readonly version: string;
}

export interface SmokeDependencies {
  readonly fetch: Fetch;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly print: (message: string) => void;
}

/** Caddy tarda en obtener el certificado la primera vez: hasta 3 minutos de intentos. */
export const SMOKE_ATTEMPTS = 36;
export const SMOKE_INTERVAL_MS = 5000;

interface Check {
  readonly name: string;
  readonly run: () => Promise<string | undefined>;
}

const statusSchema = z.object({ status: z.string() });
const versionSchema = z.object({ commit: z.string(), environment: z.string() });

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Cómo pide cada prueba: sin seguir redirecciones, con límite de tiempo y, si se pide, autenticada. */
interface Client {
  readonly settings: SmokeSettings;
  readonly site: string;
  readonly get: (url: string, authenticated?: boolean) => Promise<Response>;
}

function client(settings: SmokeSettings, fetch: Fetch): Client {
  const credentials = Buffer.from(`${settings.user}:${settings.password}`).toString('base64');
  const auth = { Authorization: `Basic ${credentials}` };
  return {
    settings,
    site: `https://${settings.domain}`,
    get: (url, authenticated = true) =>
      fetch(url, {
        headers: authenticated ? auth : {},
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      }),
  };
}

const answered = (response: Response, expected: number): string =>
  `respondió ${String(response.status)} en lugar de ${String(expected)}`;

async function deniesWithoutPassword({ site, get }: Client): Promise<string | undefined> {
  const response = await get(`${site}/healthz`, false);
  if (response.status !== 401) return answered(response, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  if (!challenge.startsWith('Basic')) return 'el navegador no recibe la petición de contraseña';
  const robots = response.headers.get('x-robots-tag') ?? '';
  return robots.includes('noindex') ? undefined : 'falta la cabecera X-Robots-Tag noindex';
}

async function mailboxDenied({ settings, get }: Client): Promise<string | undefined> {
  const response = await get(`https://correo.${settings.domain}/`, false);
  return response.status === 401 ? undefined : answered(response, 401);
}

async function redirectsToHttps({ settings, get }: Client): Promise<string | undefined> {
  const response = await get(`http://${settings.domain}/`, false);
  const location = response.headers.get('location') ?? '';
  const redirect = response.status >= 300 && response.status < 400;
  return redirect && location.startsWith('https://')
    ? undefined
    : `respondió ${String(response.status)} hacia «${location}»`;
}

async function webAlive({ site, get }: Client): Promise<string | undefined> {
  const response = await get(`${site}/healthz`);
  const body = statusSchema.safeParse(await json(response));
  return response.status === 200 && body.success && body.data.status === 'ok'
    ? undefined
    : `respondió ${String(response.status)}`;
}

async function apiHealthy({ site, get }: Client): Promise<string | undefined> {
  const response = await get(`${site}/api/health`);
  const body = statusSchema.safeParse(await json(response));
  const status = body.success ? body.data.status : '?';
  return response.status === 200 && status === 'ok'
    ? undefined
    : `respondió ${String(response.status)} con estado «${status}»`;
}

async function expectedVersion({ settings, site, get }: Client): Promise<string | undefined> {
  const body = versionSchema.safeParse(await json(await get(`${site}/api/version`)));
  if (!body.success) return 'la respuesta de /version no es válida';
  const { commit, environment } = body.data;
  return commit === settings.version && environment === 'staging'
    ? undefined
    : `reporta ${commit} en «${environment}»`;
}

const CHECKS: readonly [string, (client: Client) => Promise<string | undefined>][] = [
  ['Sin la contraseña adicional se niega la entrada y no se indexa', deniesWithoutPassword],
  ['La bandeja de correo de pruebas también pide la contraseña', mailboxDenied],
  ['HTTP redirige a HTTPS', redirectsToHttps],
  ['La web está viva', webAlive],
  ['La API responde con base de datos, colas y archivos', apiHealthy],
  ['La API publicada es la versión esperada del ambiente de pruebas', expectedVersion],
];

function checks(settings: SmokeSettings, fetch: Fetch): Check[] {
  const http = client(settings, fetch);
  return CHECKS.map(([name, check]) => ({ name, run: () => check(http) }));
}

async function runOnce(list: readonly Check[]): Promise<string[]> {
  const failures: string[] = [];
  for (const check of list) {
    const problem = await check.run().catch((error: unknown) => {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      return cause instanceof Error ? cause.message : String(cause);
    });
    if (problem !== undefined) failures.push(`${check.name}: ${problem}`);
  }
  return failures;
}

/**
 * Repite todas las pruebas hasta que pasen o se acaben los intentos.
 * Devuelve las fallas del último intento (vacío si todo pasó).
 */
export async function runSmokeTests(
  settings: SmokeSettings,
  deps: SmokeDependencies,
  attempts = SMOKE_ATTEMPTS,
): Promise<string[]> {
  const list = checks(settings, deps.fetch);
  let failures: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    failures = await runOnce(list);
    if (failures.length === 0) {
      const total = String(list.length);
      deps.print(`Pruebas de humo superadas (${total} de ${total}).\n`);
      return [];
    }
    if (attempt < attempts) await deps.sleep(SMOKE_INTERVAL_MS);
  }
  deps.print(`Pruebas de humo fallidas:\n${failures.map((line) => `  - ${line}`).join('\n')}\n`);
  return failures;
}
