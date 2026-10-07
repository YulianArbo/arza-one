import type { Page, Route } from '@playwright/test';

import { E2E_API_URL, E2E_WEB_URL } from './environment';

export const VERSION = { version: '0.1.0', environment: 'local', commit: 'e2e0001' };
export const HEALTHY = { status: 'ok', checks: { database: 'up', queues: 'up', files: 'up' } };
export const DEGRADED = {
  status: 'degraded',
  checks: { database: 'up', queues: 'down', files: 'up' },
};

interface MockResponse {
  status?: number;
  body: unknown;
}

export type ApiRoutes = Record<string, MockResponse | (() => MockResponse) | 'offline'>;

// La web y la API están en orígenes distintos: la respuesta simulada lleva las mismas
// cabeceras CORS que la API real (B02) para que el navegador la acepte.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': E2E_WEB_URL,
  'Access-Control-Allow-Credentials': 'true',
};

/** Simula la API: cada ruta responde lo indicado; las demás se rechazan. */
export async function mockApi(page: Page, routes: ApiRoutes): Promise<void> {
  await page.route(`${E2E_API_URL}/**`, async (route: Route) => {
    const handler = routes[new URL(route.request().url()).pathname];
    if (handler === undefined || handler === 'offline') {
      await route.abort('connectionrefused');
      return;
    }
    const response = typeof handler === 'function' ? handler() : handler;
    await route.fulfill({
      status: response.status ?? 200,
      headers: CORS_HEADERS,
      contentType: 'application/json',
      body: JSON.stringify(response.body),
    });
  });
}

export function apiError(code: string, message: string, correlationId: string): unknown {
  return { error: { code, message, details: [], correlation_id: correlationId } };
}

/** La API responde que todo funciona. */
export async function mockHealthyApi(page: Page): Promise<void> {
  await mockApi(page, { '/version': { body: VERSION }, '/health': { body: HEALTHY } });
}
