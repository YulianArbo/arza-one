import { randomUUID } from 'node:crypto';

// Envío de errores inesperados a GlitchTip (numerales 10.7 y 13.2, B44). GlitchTip recibe el
// formato de Sentry; para no traer el SDK completo (y OpenTelemetry con él) se usa su punto
// «store» con una sola petición. Solo viajan el tipo de error, un mensaje recortado y sin datos
// que parezcan personales, la pila y el identificador de correlación: nunca la petición, las
// cookies, los encabezados ni el cuerpo.

const SEND_TIMEOUT_MS = 2000;
const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_LENGTH = 4000;
const SENTRY_VERSION = 7;

export interface ErrorContext {
  /** Identificador de correlación de la petición o del trabajo. */
  readonly correlationId?: string | null;
  /** Dónde ocurrió: la ruta con sus parámetros sin valores, o el nombre del trabajo. */
  readonly where?: string;
}

export interface ErrorReporter {
  report(error: unknown, context?: ErrorContext): void;
}

/** Reporte que no hace nada: local, pruebas o servidor sin GlitchTip configurado. */
export const NO_ERROR_REPORTER: ErrorReporter = { report: () => undefined };

interface Dsn {
  readonly storeUrl: string;
  readonly publicKey: string;
}

/** Lee la dirección de GlitchTip («https://llave@servidor/proyecto»). */
export function parseDsn(dsn: string): Dsn {
  const url = new URL(dsn);
  const project = url.pathname.replace(/^\/+|\/+$/g, '');
  if (url.username === '' || project === '') throw new Error('GLITCHTIP_DSN no es válida.');
  return { storeUrl: `${url.origin}/api/${project}/store/`, publicKey: url.username };
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LONG_NUMBER = /\d{6,}/g;
const QUOTED = /(["'`])(?:(?!\1).){1,200}\1/g;

/** Quita del mensaje lo que podría ser un dato personal: correos, números largos y valores. */
export function scrubMessage(message: string): string {
  return message
    .replace(EMAIL, '[correo]')
    .replace(LONG_NUMBER, '[número]')
    .replace(QUOTED, '[valor]')
    .slice(0, MAX_MESSAGE_LENGTH);
}

export interface ReporterSettings {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string;
  readonly service: 'api' | 'worker';
}

/** Evento en el formato de Sentry que GlitchTip entiende. */
export function errorEvent(
  error: unknown,
  settings: Omit<ReporterSettings, 'dsn'>,
  context: ErrorContext = {},
): Record<string, unknown> {
  const type = error instanceof Error ? error.name : 'Error';
  const message = scrubMessage(error instanceof Error ? error.message : String(error));
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  return {
    event_id: randomUUID().replaceAll('-', ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    environment: settings.environment,
    release: settings.release,
    server_name: settings.service,
    transaction: context.where,
    tags: { service: settings.service, correlation_id: context.correlationId ?? undefined },
    exception: { values: [{ type, value: message }] },
    extra: { stack: stackLines(stack) },
  };
}

/** La pila como líneas «at …», sin el mensaje (que ya va depurado). */
function stackLines(stack: string): string[] {
  return stack
    .slice(0, MAX_STACK_LENGTH)
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

export type Send = (url: string, init: RequestInit) => Promise<unknown>;

/** Reporte real: envía sin esperar y nunca lanza; si GlitchTip no responde, el error se pierde. */
export function glitchTipReporter(settings: ReporterSettings, send: Send = fetch): ErrorReporter {
  const dsn = parseDsn(settings.dsn);
  const auth =
    `Sentry sentry_version=${String(SENTRY_VERSION)}, sentry_key=${dsn.publicKey}, ` +
    `sentry_client=arza-one/${settings.service}`;
  return {
    report(error, context) {
      const body = JSON.stringify(errorEvent(error, settings, context));
      void send(dsn.storeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': auth },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      }).catch(() => undefined);
    },
  };
}

/** El reporte que corresponde a la configuración: real si hay DSN, vacío si no. */
export function errorReporterFor(
  settings: Omit<ReporterSettings, 'dsn'> & { readonly dsn: string | undefined },
): ErrorReporter {
  if (settings.dsn === undefined) return NO_ERROR_REPORTER;
  return glitchTipReporter({ ...settings, dsn: settings.dsn });
}

/** Proveedor de NestJS con el reporte de la API (GlitchTip o vacío). */
export const ERROR_REPORTER = Symbol('ERROR_REPORTER');
