import { PERMISSIONS } from '@arza/contracts';
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
  stage: 'complete',
  csrf_token: 'codigo-de-prueba',
  expires_at: '2026-10-10T03:00:00.000Z',
};

/** Sesión de una persona del portal del cliente (ficticia). */
const PORTAL_SESSION = {
  ...INTERNAL_SESSION,
  user: { ...INTERNAL_SESSION.user, email: 'cliente@cliente.test', kind: 'portal' },
};

const NO_SESSION = {
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

/** Sesiones a medias (B09): verificó la contraseña y le falta escribir o configurar el código. */
export const PENDING_SESSIONS = {
  second_factor: { ...INTERNAL_SESSION, stage: 'second_factor' },
  second_factor_setup: { ...INTERNAL_SESSION, stage: 'second_factor_setup' },
} as const;

export type SessionKind = 'internal' | 'portal' | 'none' | keyof typeof PENDING_SESSIONS;

function sessionBody(kind: Exclude<SessionKind, 'none'>): unknown {
  if (kind === 'internal') return INTERNAL_SESSION;
  return kind === 'portal' ? PORTAL_SESSION : PENDING_SESSIONS[kind];
}

/** Cambia la sesión que simula la API: interna, del portal, a medias o ninguna. */
export async function mockSession(page: Page, kind: SessionKind): Promise<void> {
  await page.route(`${E2E_API_URL}/v1/auth/session`, async (route) => {
    if (kind === 'none') await fulfillJson(route, NO_SESSION.status, NO_SESSION.body);
    else await fulfillJson(route, 200, sessionBody(kind));
  });
}

/** Todos los permisos del catálogo: el menú muestra todos los módulos (B10). */
export const ALL_PERMISSIONS = {
  roles: [{ id: '01999a00-0000-7000-8000-00000000c010', code: 'DIRECCION', name: 'Dirección' }],
  permissions: PERMISSIONS.map((permission) => ({ code: permission.code, scope: 'all' })),
};

/** Sin roles: solo lo que no exige permiso. */
export const NO_PERMISSIONS = { roles: [], permissions: [] };

/** Cambia los permisos que la API dice que tiene la persona (GET /v1/me/permissions). */
export async function mockPermissions(page: Page, body: unknown): Promise<void> {
  await page.route(`${E2E_API_URL}/v1/me/permissions`, async (route) => {
    await fulfillJson(route, 200, body);
  });
}
