import { PLATFORM_ERROR_CODES, errorResponseSchema } from '@arza/contracts';
import type { z } from 'zod';

import { ApiError, CLIENT_ERROR_CODES, CLIENT_ERROR_MESSAGES } from './api-error';

const CORRELATION_HEADER = 'x-correlation-id';

interface GetOptions<T> {
  /** Esquema del contrato (packages/contracts) que debe cumplir la respuesta. */
  schema: z.ZodType<T>;
  /** Códigos HTTP que traen una respuesta válida, por ejemplo 503 en /health. */
  acceptedStatuses?: readonly number[];
  signal?: AbortSignal;
}

interface PostOptions<T> {
  /** Cuerpo de la petición; se envía como JSON. */
  body: object;
  /** Esquema de la respuesta; sin esquema se espera una respuesta vacía (204). */
  schema?: z.ZodType<T>;
  /** Código antifalsificación de la sesión (numeral 13.1, paso 5), si hay sesión. */
  csrfToken?: string;
}

interface PatchOptions<T> extends PostOptions<T> {
  /** Versión del registro que se editó (cabecera If-Match, numeral 14.1). */
  version: number;
}

/** Archivo que entrega la API, como una exportación (numeral 13.2). */
export interface DownloadedFile {
  readonly fileName: string;
  readonly content: Blob;
}

export interface ApiClient {
  get<T>(path: string, options: GetOptions<T>): Promise<T>;
  post<T = void>(path: string, options: PostOptions<T>): Promise<T>;
  patch<T = void>(path: string, options: PatchOptions<T>): Promise<T>;
  /** POST que responde un archivo en lugar de JSON. */
  download(path: string, options: Omit<PostOptions<never>, 'schema'>): Promise<DownloadedFile>;
}

const CSRF_HEADER = 'X-CSRF-Token';

/**
 * Cliente de la API. Envía la cookie de sesión, revisa cada respuesta contra su esquema y
 * convierte cualquier falla en un ApiError con un mensaje en español y el identificador
 * de correlación para soporte.
 */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  return {
    async get<T>(path: string, options: GetOptions<T>): Promise<T> {
      const init = { method: 'GET', headers: { Accept: 'application/json' } };
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), init, options.signal);
      const body = await readJson(response);
      const accepted = options.acceptedStatuses ?? [];
      if (!response.ok && !accepted.includes(response.status)) {
        throw toApiError(response, body);
      }
      return parseBody(response, body, options.schema);
    },

    async post<T = void>(path: string, options: PostOptions<T>): Promise<T> {
      return sendWithBody(fetchImpl, apiEndpoint(baseUrl, path), 'POST', options);
    },

    async patch<T = void>(path: string, options: PatchOptions<T>): Promise<T> {
      const ifMatch = { 'If-Match': `"${String(options.version)}"` };
      return sendWithBody(fetchImpl, apiEndpoint(baseUrl, path), 'PATCH', options, ifMatch);
    },

    async download(path, options): Promise<DownloadedFile> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.csrfToken !== undefined) headers[CSRF_HEADER] = options.csrfToken;
      const init = { method: 'POST', headers, body: JSON.stringify(options.body) };
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), init);
      if (!response.ok) throw toApiError(response, await readJson(response));
      return { fileName: fileNameOf(response), content: await response.blob() };
    },
  };
}

/** Nombre que la API propone en Content-Disposition; «descarga» si no trae uno. */
function fileNameOf(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'descarga';
}

/** POST o PATCH con cuerpo JSON y, si hay sesión, el código antifalsificación. */
async function sendWithBody<T>(
  fetchImpl: typeof fetch,
  url: URL,
  method: 'POST' | 'PATCH',
  options: PostOptions<T>,
  extra: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
  if (options.csrfToken !== undefined) headers[CSRF_HEADER] = options.csrfToken;
  const init = { method, headers, body: JSON.stringify(options.body) };
  const response = await send(fetchImpl, url, init);
  const body = await readJson(response);
  if (!response.ok) throw toApiError(response, body);
  // Sin esquema la respuesta no trae datos (204): no hay nada que devolver.
  return options.schema === undefined
    ? (undefined as T)
    : parseBody(response, body, options.schema);
}

/**
 * Une la dirección de la API con la ruta pedida conservando su prefijo: en pruebas la API vive en
 * https://pruebas.[dominio]/api (B07), y `new URL('/health', base)` descartaría ese /api.
 */
export function apiEndpoint(baseUrl: string, path: string): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base);
}

async function send(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, credentials: 'include', ...(signal ? { signal } : {}) });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw new ApiError(CLIENT_ERROR_CODES.network, CLIENT_ERROR_MESSAGES.network, 0);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function correlationIdOf(response: Response): string | undefined {
  return response.headers.get(CORRELATION_HEADER) ?? undefined;
}

function toApiError(response: Response, body: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, correlation_id } = parsed.data.error;
    return new ApiError(code, message, response.status, correlation_id);
  }
  return new ApiError(
    PLATFORM_ERROR_CODES.internalError,
    CLIENT_ERROR_MESSAGES.unexpected,
    response.status,
    correlationIdOf(response),
  );
}

function parseBody<T>(response: Response, body: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      CLIENT_ERROR_CODES.invalidResponse,
      CLIENT_ERROR_MESSAGES.invalidResponse,
      response.status,
      correlationIdOf(response),
    );
  }
  return parsed.data;
}
