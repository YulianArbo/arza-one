import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

import { ALL_PERMISSIONS, INTERNAL_SESSION, fulfillJson } from './api-mock';
import { E2E_API_URL, E2E_WEB_URL } from './environment';

export { expect };

// Reglas de WCAG 2.2 nivel AA (numeral 16.6).
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const CHOICE_VISITOR = '01999a00-0000-7000-8000-00000000f040';

const OWN_ORIGINS = new Set([new URL(E2E_WEB_URL).origin, new URL(E2E_API_URL).origin]);

const EMPTY_FUNNEL = {
  generated_at: '2026-10-24T15:00:00.000Z',
  stages: [],
  totals: {
    open_count: 0,
    open_value: '0.00',
    weighted_value: '0.00',
    won_count: 0,
    won_value: '0.00',
    lost_count: 0,
    lost_value: '0.00',
    win_rate: null,
    leads_count: 0,
    converted_leads: 0,
    lead_conversion_rate: null,
  },
  lost_reasons: [],
  rows: [],
};

/**
 * Lo que la estructura de cualquier pantalla pide (la campanita, B16), el tablero de Inicio (B22A)
 * y las listas que cualquier ficha muestra (comentarios y adjuntos): vacías salvo que la prueba
 * diga otra cosa.
 */
const EMPTY_LISTS: Readonly<Record<string, unknown>> = {
  '/v1/me/notifications': { items: [], unread_count: 0 },
  // La barra superior pide el perfil para la foto y el portal su empresa (B22A).
  '/v1/me': {
    ...INTERNAL_SESSION.user,
    last_login_at: null,
    password_changed_at: null,
    has_photo: false,
  },
  '/v1/me/company': { company: null },
  '/v1/tasks/mine': { data: [], next_cursor: null },
  '/v1/crm/reports/funnel': EMPTY_FUNNEL,
  '/v1/comments': { items: [] },
  '/v1/attachments': { items: [] },
  '/v1/files': { data: [] },
  // Las fichas de documento, tiquete y PQRSF piden el estado del asistente (B47): apagado.
  '/v1/ai/status': {
    provider: 'off',
    model: null,
    enabled_use_cases: [],
    used_today: 0,
    daily_limit: 50,
  },
  // El acceso pide los comunicados vigentes (B36A); sin comunicados, no muestra nada.
  '/v1/public/announcements': { data: [] },
  // El sitio pide sus páginas publicadas, el aviso de los formularios y la versión de la política
  // de cookies (B41); por defecto no hay páginas ni aviso, y la política va en su versión 1.
  '/v1/public/pages': { data: [] },
  '/v1/public/forms/notice': { available: false, notice: null },
  '/v1/public/legal/cookie_policy': {
    id: '01999a00-0000-7000-8000-00000000f041',
    key: 'cookie_policy',
    title: 'Política de cookies',
    body: 'Texto de prueba de la política de cookies.',
    version_number: 1,
    effective_from: '2026-11-22T15:00:00.000Z',
  },
};

interface Fixtures {
  /** Orígenes ajenos a la plataforma a los que la página intentó conectarse. */
  thirdPartyRequests: string[];
  /** Errores de la consola del navegador y excepciones de la página. */
  consoleErrors: string[];
  /**
   * Simulación base de la API: sesión interna iniciada con todos los permisos (B10), sin avisos
   * ni comentarios; lo demás, sin conexión.
   */
  baseApi: undefined;
  /** El aviso de cookies ya respondido (B41). */
  cookieChoice: undefined;
}

/**
 * Cada prueba vigila, sin que haya que pedirlo, que la página no se conecte a dominios
 * de terceros (criterio de B04) y que no haya errores en la consola.
 */
export const test = base.extend<Fixtures>({
  // Se registra antes que las simulaciones de cada prueba (mockApi, mockSession), que tienen
  // prioridad sobre ella.
  baseApi: [
    async ({ page }, use) => {
      await page.route(`${E2E_API_URL}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/v1/auth/session') {
          await fulfillJson(route, 200, INTERNAL_SESSION);
        } else if (path === '/v1/me/permissions') {
          await fulfillJson(route, 200, ALL_PERMISSIONS);
        } else if (EMPTY_LISTS[path] !== undefined) {
          await fulfillJson(route, 200, EMPTY_LISTS[path]);
        } else {
          await route.abort('connectionrefused');
        }
      });
      await use(undefined);
    },
    { auto: true },
  ],
  // El aviso de cookies del sitio (B41) ya respondido, para que no tape las pantallas públicas;
  // las pruebas del aviso lo borran con askCookies.
  cookieChoice: [
    async ({ page }, use) => {
      const value = encodeURIComponent(`${CHOICE_VISITOR}|1|p|${new Date().toISOString()}`);
      await page.context().addCookies([{ name: 'arza_cookie_consent', value, url: E2E_WEB_URL }]);
      await use(undefined);
    },
    { auto: true },
  ],
  thirdPartyRequests: [
    async ({ page }, use) => {
      const origins: string[] = [];
      page.on('request', (request) => {
        const { origin, protocol } = new URL(request.url());
        if (protocol.startsWith('http') && !OWN_ORIGINS.has(origin)) {
          origins.push(origin);
        }
      });
      await use(origins);
      expect(origins, 'La página no debe cargar nada de dominios de terceros').toEqual([]);
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
    },
    { auto: true },
  ],
});

/** Revisa la página con axe-core y devuelve las violaciones de accesibilidad encontradas. */
export async function accessibilityViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
  );
}

/** Fija el modo claro u oscuro con la misma cookie que usa la aplicación. */
export async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.context().addCookies([{ name: 'arza_theme', value: theme, url: E2E_WEB_URL }]);
}

/**
 * Espera a que la aplicación interna termine de verificar la sesión y muestre su estructura
 * (B08). Antes de eso el teclado no tiene a dónde ir.
 */
export async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Menú del usuario' })).toBeVisible();
}

/** Borra la elección de cookies: el sitio vuelve a mostrar el aviso (B41). */
export async function askCookies(page: Page): Promise<void> {
  await page.context().clearCookies({ name: 'arza_cookie_consent' });
}
