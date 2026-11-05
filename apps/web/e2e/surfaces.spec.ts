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

  test('el selector de apariencia se ve y marca el modo claro', async ({ page }) => {
    await useTheme(page, 'light');
    await mockSession(page, 'none');
    await page.goto('/iniciar-sesion');
    const selector = page.getByRole('group', { name: 'Apariencia' });
    // Fondo de tarjeta (#ffffff) sobre la barra, con la opción elegida resaltada.
    await expect(selector).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(selector.getByRole('button', { name: 'Claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test('en escritorio el acceso muestra el panel de la marca junto al formulario', async ({
  page,
}) => {
  await mockSession(page, 'none');
  await page.goto('/iniciar-sesion');
  await expect(page.getByText(/^Mensaje del día/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'ARZA ONE' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});
