import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

import { ALL_PERMISSIONS, INTERNAL_SESSION, fulfillJson } from './api-mock';
import { E2E_API_URL, E2E_WEB_URL } from './environment';

export { expect };

// Reglas de WCAG 2.2 nivel AA (numeral 16.6).
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const OWN_ORIGINS = new Set([new URL(E2E_WEB_URL).origin, new URL(E2E_API_URL).origin]);

/**
 * Lo que la estructura de cualquier pantalla pide (la campanita, B16) y las listas que cualquier
 * ficha muestra (comentarios y adjuntos): vacías salvo que la prueba diga otra cosa.
 */
const EMPTY_LISTS: Readonly<Record<string, unknown>> = {
  '/v1/me/notifications': { items: [], unread_count: 0 },
  '/v1/comments': { items: [] },
  '/v1/attachments': { items: [] },
  '/v1/files': { data: [] },
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
