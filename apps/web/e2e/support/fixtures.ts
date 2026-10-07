import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

import { E2E_API_URL, E2E_WEB_URL } from './environment';

export { expect };

// Reglas de WCAG 2.2 nivel AA (numeral 16.6).
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const OWN_ORIGINS = new Set([new URL(E2E_WEB_URL).origin, new URL(E2E_API_URL).origin]);

interface Fixtures {
  /** Orígenes ajenos a la plataforma a los que la página intentó conectarse. */
  thirdPartyRequests: string[];
  /** Errores de la consola del navegador y excepciones de la página. */
  consoleErrors: string[];
}

/**
 * Cada prueba vigila, sin que haya que pedirlo, que la página no se conecte a dominios
 * de terceros (criterio de B04) y que no haya errores en la consola.
 */
export const test = base.extend<Fixtures>({
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
