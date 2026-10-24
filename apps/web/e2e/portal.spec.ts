import { mockSession } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Encabezado del portal del cliente (B22A): pestañas arriba y secciones «Disponible pronto».

for (const theme of ['light', 'dark'] as const) {
  test(`las pestañas llevan a cada sección sin violaciones en modo ${theme}`, async ({ page }) => {
    await useTheme(page, theme);
    await mockSession(page, 'portal');
    await page.goto('/portal');
    const tabs = page.getByRole('navigation', { name: 'Secciones del portal' });
    await expect(tabs.getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await tabs.getByRole('link', { name: 'Facturas' }).click();
    await expect(page).toHaveURL(/\/portal\/facturas$/);
    await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible();
    await expect(page.getByText('Disponible pronto')).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Facturas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

// Como en la aplicación interna (shell.spec.ts): la pantalla de carga ya salió con código 200, así
// que se comprueba la página clara y que no se indexe.
test('una sección que no existe muestra la página clara y no se indexa', async ({ page }) => {
  await mockSession(page, 'portal');
  await page.goto('/portal/otra');
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});

test.describe('portal en celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('las pestañas se deslizan sin desbordar la página', async ({ page }) => {
    await mockSession(page, 'portal');
    await page.goto('/portal/soporte');
    await expect(page.getByRole('heading', { name: 'Soporte' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
