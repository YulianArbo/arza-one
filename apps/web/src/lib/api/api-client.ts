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

export interface ApiClient {
  get<T>(path: string, options: GetOptions<T>): Promise<T>;
}

/**
 * Cliente de la API. Envía la cookie de sesión, revisa cada respuesta contra su esquema y
 * convierte cualquier falla en un ApiError con un mensaje en español y el identificador
 * de correlación para soporte.
 */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  return {
    async get<T>(path: string, options: GetOptions<T>): Promise<T> {
      const response = await send(fetchImpl, apiEndpoint(baseUrl, path), options.signal);
      const body = await readJson(response);
      const accepted = options.acceptedStatuses ?? [];
      if (!response.ok && !accepted.includes(response.status)) {
        throw toApiError(response, body);
      }
      return parseBody(response, body, options.schema);
    },
  };
}

/**
 * Une la dirección de la API con la ruta pedida conservando su prefijo: en pruebas la API vive en
 * https://pruebas.[dominio]/api (B07), y `new URL('/health', base)` descartaría ese /api.
 */
export function apiEndpoint(baseUrl: string, path: string): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base);
}

async function send(fetchImpl: typeof fetch, url: URL, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    });
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
