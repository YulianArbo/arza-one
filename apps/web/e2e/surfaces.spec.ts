import { mockHealthyApi, mockSession } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// B20A: el sitio público, el acceso y el portal se diseñan primero para celular (16.6).
const MOBILE_PAGES = [
  { path: '/', ready: 'ARZA TECH S.A.S.', session: 'none' },
  { path: '/iniciar-sesion', ready: '¿Olvidó su contraseña?', session: 'none' },
  { path: '/portal', ready: 'Su portal estará disponible pronto', session: 'portal' },
] as const;

test.describe('superficies en celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const { path, ready, session } of MOBILE_PAGES) {
    test(`${path} no se desborda ni tiene violaciones`, async ({ page }) => {
      await mockHealthyApi(page);
      await mockSession(page, session);
      await page.goto(path);
      await expect(page.getByText(ready).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await accessibilityViolations(page)).toEqual([]);
    });
  }

  test('el botón de apariencia se ve sobre la barra oscura en modo claro', async ({ page }) => {
    await useTheme(page, 'light');
    await mockSession(page, 'none');
    await page.goto('/iniciar-sesion');
    const button = page.getByRole('button', { name: /^Apariencia/ });
    // El color del texto de la barra de marca (#e6edf7), no el azul oscuro de su fondo.
    await expect(button).toHaveCSS('color', 'rgb(230, 237, 247)');
  });
});

test('en escritorio el acceso muestra el panel de la marca junto al formulario', async ({
  page,
}) => {
  await mockSession(page, 'none');
  await page.goto('/iniciar-sesion');
  await expect(page.getByText('Su trabajo diario, en un solo lugar.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ARZA ONE' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
