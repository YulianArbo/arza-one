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

/**
 * Simula la API: cada ruta responde lo indicado. Las demás siguen a la simulación base de
 * fixtures.ts (sesión iniciada; todo lo demás, sin conexión).
 */
export async function mockApi(page: Page, routes: ApiRoutes): Promise<void> {
  await page.route(`${E2E_API_URL}/**`, async (route: Route) => {
    const handler = routes[new URL(route.request().url()).pathname];
    if (handler === undefined) {
      await route.fallback();
      return;
    }
    if (handler === 'offline') {
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

/** Sesión de una persona de la aplicación interna (ficticia). */
export const INTERNAL_SESSION = {
  user: {
    id: '01999a00-0000-7000-8000-00000000a001',
    email: 'ana@demo-uno.test',
    display_name: 'Ana Pérez',
    kind: 'internal',
  },
  csrf_token: 'codigo-de-prueba',
  expires_at: '2026-10-10T03:00:00.000Z',
};

/** Sesión de una persona del portal del cliente (ficticia). */
export const PORTAL_SESSION = {
  ...INTERNAL_SESSION,
  user: { ...INTERNAL_SESSION.user, email: 'cliente@cliente.test', kind: 'portal' },
};

export const NO_SESSION = {
  status: 401,
  body: apiError('UNAUTHENTICATED', 'Debe iniciar sesión para continuar.', 'corr-0001'),
};

/** Respuesta de la API a un navegador en la web (con las cabeceras CORS de la API real). */
export async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    headers: CORS_HEADERS,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Cambia la sesión que simula la API: interna, del portal o ninguna. */
export async function mockSession(page: Page, kind: 'internal' | 'portal' | 'none'): Promise<void> {
  await page.route(`${E2E_API_URL}/v1/auth/session`, async (route) => {
    if (kind === 'none') await fulfillJson(route, NO_SESSION.status, NO_SESSION.body);
    else await fulfillJson(route, 200, kind === 'portal' ? PORTAL_SESSION : INTERNAL_SESSION);
  });
}
