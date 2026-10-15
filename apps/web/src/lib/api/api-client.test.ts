import { versionResponseSchema } from '@arza/contracts';
import { describe, expect, it, vi } from 'vitest';

import { apiEndpoint, createApiClient } from './api-client';
import { ApiError, CLIENT_ERROR_CODES, CLIENT_ERROR_MESSAGES } from './api-error';

const BASE_URL = 'http://api.test:4000';
const VERSION = { version: '0.1.0', environment: 'local', commit: 'abc1234' };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function clientReturning(response: Response): ReturnType<typeof createApiClient> {
  return createApiClient(BASE_URL, () => Promise.resolve(response));
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  if (!(error instanceof ApiError)) {
    throw new Error('Se esperaba un ApiError');
  }
  return error;
}

describe('cliente de la API: respuestas válidas', () => {
  it('devuelve los datos validados con el esquema del contrato', async () => {
    const client = clientReturning(jsonResponse(VERSION));
    await expect(client.get('/version', { schema: versionResponseSchema })).resolves.toEqual(
      VERSION,
    );
  });

  it('envía la cookie de sesión y pide JSON a la dirección de la API', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(VERSION)));
    await createApiClient(BASE_URL, fetchImpl).get('/version', { schema: versionResponseSchema });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('/version', BASE_URL),
      expect.objectContaining({ credentials: 'include', headers: { Accept: 'application/json' } }),
    );
  });

  it('acepta códigos de error previstos que traen datos válidos', async () => {
    const client = clientReturning(jsonResponse(VERSION, 503));
    const result = client.get('/version', {
      schema: versionResponseSchema,
      acceptedStatuses: [503],
    });
    await expect(result).resolves.toEqual(VERSION);
  });
});

describe('cliente de la API: errores', () => {
  it('convierte el error de la API (14.2) conservando mensaje y correlación', async () => {
    const body = {
      error: {
        code: 'FORBIDDEN',
        message: 'No tiene permiso.',
        details: [],
        correlation_id: 'c-1',
      },
    };
    const error = await errorOf(
      clientReturning(jsonResponse(body, 403)).get('/version', { schema: versionResponseSchema }),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403, correlationId: 'c-1' });
    expect(error.message).toBe('No tiene permiso.');
    expect(error.isForbidden).toBe(true);
    expect(error.isTransient).toBe(false);
  });

  it('un error sin el formato esperado da un mensaje genérico y la correlación de la cabecera', async () => {
    const response = new Response('Bad Gateway', {
      status: 502,
      headers: { 'X-Correlation-Id': 'c-2' },
    });
    const error = await errorOf(
      clientReturning(response).get('/version', { schema: versionResponseSchema }),
    );
    expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 502, correlationId: 'c-2' });
    expect(error.message).toBe(CLIENT_ERROR_MESSAGES.unexpected);
    expect(error.isTransient).toBe(true);
  });
});

describe('cliente de la API: respuestas inválidas y sin conexión', () => {
  it('rechaza una respuesta que no cumple el contrato', async () => {
    const client = clientReturning(jsonResponse({ version: 1 }));
    const error = await errorOf(client.get('/version', { schema: versionResponseSchema }));
    expect(error.code).toBe(CLIENT_ERROR_CODES.invalidResponse);
    expect(error.correlationId).toBeUndefined();
  });

  it('sin conexión informa en español que no hubo comunicación', async () => {
    const client = createApiClient(BASE_URL, () => Promise.reject(new TypeError('fetch failed')));
    const error = await errorOf(client.get('/version', { schema: versionResponseSchema }));
    expect(error).toMatchObject({ code: CLIENT_ERROR_CODES.network, status: 0 });
    expect(error.message).toBe(CLIENT_ERROR_MESSAGES.network);
  });

  it('una consulta cancelada se cancela sin convertirse en error de conexión', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException('Cancelada', 'AbortError');
    const client = createApiClient(BASE_URL, () => Promise.reject(abortError));
    const result = client.get('/version', {
      schema: versionResponseSchema,
      signal: controller.signal,
    });
    await expect(result).rejects.toBe(abortError);
  });
});

describe('cliente de la API: dirección con prefijo', () => {
  it('conserva el prefijo de la API detrás de Caddy (pruebas, B07)', () => {
    expect(apiEndpoint('https://pruebas.example.test/api', '/health').href).toBe(
      'https://pruebas.example.test/api/health',
    );
    expect(apiEndpoint('https://pruebas.example.test/api/', 'version').href).toBe(
      'https://pruebas.example.test/api/version',
    );
  });

  it('sin prefijo deja la ruta en la raíz de la API (local)', () => {
    expect(apiEndpoint(BASE_URL, '/version').href).toBe('http://api.test:4000/version');
  });
});

describe('cliente de la API: edición con versión (B10)', () => {
  it('PATCH envía la versión en If-Match y el código antifalsificación', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(VERSION)));
    const client = createApiClient(BASE_URL, fetchImpl);
    await client.patch('/v1/roles/x', {
      body: { name: 'Nuevo' },
      version: 3,
      schema: versionResponseSchema,
      csrfToken: 'codigo',
    });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toMatchObject({ 'If-Match': '"3"', 'X-CSRF-Token': 'codigo' });
    expect(init?.body).toBe(JSON.stringify({ name: 'Nuevo' }));
  });
});

describe('cliente de la API: borrados (B12)', () => {
  it('envía DELETE con la versión y el código antifalsificación', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await createApiClient('http://api.test', fetchImpl).delete('/v1/sites/x', {
      version: 2,
      csrfToken: 'codigo',
    });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.method).toBe('DELETE');
    expect(init?.headers).toMatchObject({ 'If-Match': '"2"', 'X-CSRF-Token': 'codigo' });
  });
});

describe('cliente de la API: descargas (B11)', () => {
  it('entrega el archivo con el nombre que propone la API', async () => {
    const response = new Response('a,b\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="auditoria.csv"' },
    });
    const file = await clientReturning(response).download('/v1/audit-exports', {
      body: {},
      csrfToken: 'codigo',
    });
    expect(file.fileName).toBe('auditoria.csv');
    expect(await file.content.text()).toBe('a,b\r\n');
  });

  it('una falla de la API llega como error con su mensaje', async () => {
    const body = {
      error: { code: 'FORBIDDEN', message: 'Sin permiso', details: [], correlation_id: 'c-1' },
    };
    const error = await errorOf(
      clientReturning(jsonResponse(body, 403)).download('/v1/audit-exports', { body: {} }),
    );
    expect(error.message).toBe('Sin permiso');
    expect(error.correlationId).toBe('c-1');
  });
});

describe('cliente de la API: enlaces temporales de archivos (B14)', () => {
  const LINK = 'http://api.test/v1/files/uploads/llave';

  it('sube el archivo con su tipo al enlace', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const file = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    await createApiClient(BASE_URL, fetchImpl).putFile(LINK, file);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toEqual(new URL(LINK));
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/pdf' });
  });

  it('un enlace vencido llega como error con su mensaje', async () => {
    const body = {
      error: { code: 'FILE_LINK_INVALID', message: 'Venció', details: [], correlation_id: 'c-2' },
    };
    const upload = clientReturning(jsonResponse(body, 404)).putFile(LINK, new Blob(['x']));
    expect((await errorOf(upload)).code).toBe('FILE_LINK_INVALID');
    const preview = clientReturning(jsonResponse(body, 404)).fetchFile(LINK);
    expect((await errorOf(preview)).message).toBe('Venció');
  });

  it('trae el contenido de un enlace de descarga', async () => {
    const blob = await clientReturning(new Response('contenido')).fetchFile(LINK);
    expect(await blob.text()).toBe('contenido');
  });
});
