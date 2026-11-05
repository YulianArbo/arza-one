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
  /** Versión del registro que se vio (If-Match), en las acciones que la piden. */
  version?: number;
  /** Llave única de la operación (Idempotency-Key), en las que la piden, como enviar a firma. */
  idempotencyKey?: string;
}

interface PatchOptions<T> extends PostOptions<T> {
  /** Versión del registro que se editó (cabecera If-Match, numeral 14.1). */
  version: number;
}

interface DeleteOptions {
  readonly csrfToken?: string;
  /** Versión del registro que se vio (If-Match), si la ruta la pide. */
  readonly version?: number;
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
  /** Reemplaza un recurso completo, como las preferencias propias. */
  put<T = void>(path: string, options: PostOptions<T>): Promise<T>;
  /** Borrado lógico; la API responde 204. */
  delete(path: string, options: DeleteOptions): Promise<void>;
  /** POST que responde un archivo en lugar de JSON. */
  download(path: string, options: Omit<PostOptions<never>, 'schema'>): Promise<DownloadedFile>;
  /** Envía un archivo a un enlace temporal de subida (B14); el enlace es la autorización. */
  putFile(url: string, file: Blob): Promise<void>;
  /** Trae el contenido de un enlace temporal de descarga (B14), para la vista previa. */
  fetchFile(url: string): Promise<Blob>;
  /** Foto de perfil o logo (B22A) que entrega la API con la sesión, para mostrarlo. */
  image(path: string, signal?: AbortSignal): Promise<Blob>;
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
      return getJson(fetchImpl, apiEndpoint(baseUrl, path), options);
    },

    async post<T = void>(path: string, options: PostOptions<T>): Promise<T> {
      return sendWithBody(fetchImpl, apiEndpoint(baseUrl, path), 'POST', options);
    },

    async patch<T = void>(path: string, options: PatchOptions<T>): Promise<T> {
      return sendWithBody(fetchImpl, apiEndpoint(baseUrl, path), 'PATCH', options);
    },

    async put<T = void>(path: string, options: PostOptions<T>): Promise<T> {
      return sendWithBody(fetchImpl, apiEndpoint(baseUrl, path), 'PUT', options);
    },

    async delete(path: string, options: DeleteOptions): Promise<void> {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (options.version !== undefined) headers['If-Match'] = `"${String(options.version)}"`;
      if (options.csrfToken !== undefined) headers[CSRF_HEADER] = options.csrfToken;
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw toApiError(response, await readJson(response));
    },

    async download(path, options): Promise<DownloadedFile> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.csrfToken !== undefined) headers[CSRF_HEADER] = options.csrfToken;
      const init = { method: 'POST', headers, body: JSON.stringify(options.body) };
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), init);
      if (!response.ok) throw toApiError(response, await readJson(response));
      return { fileName: fileNameOf(response), content: await response.blob() };
    },

    async image(path, signal): Promise<Blob> {
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), { method: 'GET' }, signal);
      if (!response.ok) throw toApiError(response, await readJson(response));
      return response.blob();
    },

    ...fileLinkMethods(fetchImpl),
  };
}

/** Subida y descarga por enlaces temporales (B14): la dirección completa la entrega la API. */
function fileLinkMethods(fetchImpl: typeof fetch): Pick<ApiClient, 'putFile' | 'fetchFile'> {
  return {
    async putFile(url, file): Promise<void> {
      const init = { method: 'PUT', headers: { 'Content-Type': file.type }, body: file };
      const response = await send(fetchImpl, new URL(url), init);
      if (!response.ok) throw toApiError(response, await readJson(response));
    },

    async fetchFile(url): Promise<Blob> {
      const response = await send(fetchImpl, new URL(url), { method: 'GET' });
      if (!response.ok) throw toApiError(response, await readJson(response));
      return response.blob();
    },
  };
}

/** Nombre que la API propone en Content-Disposition; «descarga» si no trae uno. */
function fileNameOf(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'descarga';
}

/**
 * POST o PATCH con cuerpo JSON y, si hay sesión, el código antifalsificación; con la versión del
 * registro, la cabecera If-Match.
 */
async function getJson<T>(fetchImpl: typeof fetch, url: URL, options: GetOptions<T>): Promise<T> {
  const init = { method: 'GET', headers: { Accept: 'application/json' } };
  const response = await send(fetchImpl, url, init, options.signal);
  const body = await readJson(response);
  const accepted = options.acceptedStatuses ?? [];
  if (!response.ok && !accepted.includes(response.status)) {
    throw toApiError(response, body);
  }
  return parseBody(response, body, options.schema);
}

async function sendWithBody<T>(
  fetchImpl: typeof fetch,
  url: URL,
  method: 'POST' | 'PATCH' | 'PUT',
  options: PostOptions<T>,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (options.csrfToken !== undefined) headers[CSRF_HEADER] = options.csrfToken;
  if (options.version !== undefined) headers['If-Match'] = `"${String(options.version)}"`;
  if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;
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
