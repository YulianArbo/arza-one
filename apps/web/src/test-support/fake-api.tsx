import { render, type RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

import { ApiProvider } from '../lib/api/api-provider';

// Apoyo de las pruebas de pantallas: una API simulada que registra lo que la web le envía.

const API_URL = 'http://api.test';

export interface SentRequest {
  readonly method: string;
  readonly path: string;
  /** Parámetros de la dirección, por ejemplo «?q=luis&limit=25». */
  readonly search: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** Respuesta simulada; recibe la petición por si depende de sus parámetros. */
type Handler = (request: SentRequest) => Response;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message, details: [], correlation_id: 'corr-1234' } }, status);
}

/** Simula la API por «MÉTODO /ruta». Lo no previsto falla como si no hubiera conexión. */
export function mockApi(routes: Record<string, Handler>): SentRequest[] {
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL, init: RequestInit) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const request: SentRequest = {
        method,
        path: url.pathname,
        search: url.search,
        headers: init.headers as Record<string, string>,
        body,
      };
      sent.push(request);
      const handler = routes[`${method} ${url.pathname}`];
      return handler
        ? Promise.resolve(handler(request))
        : Promise.reject(new TypeError('sin conexión'));
    }),
  );
  return sent;
}

export function renderWithApi(ui: ReactNode): RenderResult {
  return render(<ApiProvider apiUrl={API_URL}>{ui}</ApiProvider>);
}

export const SESSION = {
  user: {
    id: '01999a00-0000-7000-8000-00000000a001',
    email: 'ana@demo-uno.test',
    display_name: 'Ana Pérez',
    kind: 'internal',
  },
  stage: 'complete',
  csrf_token: 'codigo-de-prueba',
  expires_at: '2026-10-10T03:00:00.000Z',
} as const;
