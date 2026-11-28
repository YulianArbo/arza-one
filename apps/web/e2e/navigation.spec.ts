import { mockHealthyApi } from './support/api-mock';
import { accessibilityViolations, expect, test, waitForAppShell } from './support/fixtures';

// El menú se adapta a escritorio, tableta y celular (criterio de B04, numeral 16.3).

test.describe('menú en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('muestra los módulos con su nombre y marca el actual', async ({ page }) => {
    await mockHealthyApi(page);
    await page.goto('/app/estado-del-sistema');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: 'Comercial' })).toBeVisible();
    await expect(menu.getByText('Comercial')).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Estado del sistema' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeHidden();
  });

  test('se recorre con el teclado y lleva al módulo elegido', async ({ page }) => {
    await page.goto('/app');
    await waitForAppShell(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    const contracts = page
      .getByRole('navigation', { name: 'Menú principal' })
      .getByRole('link', { name: 'Contratos' });
    await contracts.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/contratos$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Contratos' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText(
      'InicioContratos',
    );
  });
});

test.describe('menú plegable en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // B49: plegar el menú no borra lo escrito, deja marcado el módulo actual y se recuerda.
  test('se pliega a iconos sin perder lo escrito y lo recuerda al volver', async ({ page }) => {
    await page.goto('/app/sistema-de-diseno');
    await waitForAppShell(page);
    const field = page.getByLabel('Nombre del cliente');
    await field.fill('Cliente de prueba');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await page.getByRole('button', { name: 'Contraer menú' }).click();

    await expect(page.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(menu.getByText('Comercial')).not.toBeInViewport();
    await expect(field).toHaveValue('Cliente de prueba');
    await menu.getByRole('link', { name: 'Comercial' }).focus();
    await expect(page.getByRole('tooltip')).toHaveText('Comercial');
    expect(await accessibilityViolations(page)).toEqual([]);

    await page.reload();
    await waitForAppShell(page);
    await page.getByRole('button', { name: 'Expandir menú' }).click();
    await expect(menu.getByText('Comercial')).toBeVisible();
  });
});

test.describe('menú en tableta', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('se contrae a iconos y el nombre aparece al enfocar', async ({ page }) => {
    await page.goto('/app');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    const commercial = menu.getByRole('link', { name: 'Comercial' });
    await expect(commercial).toBeVisible();
    await expect(menu.getByText('Comercial')).not.toBeInViewport();
    await commercial.focus();
    await expect(page.getByRole('tooltip')).toHaveText('Comercial');
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeHidden();
  });
});

test.describe('menú en celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('se abre desde la barra superior, navega y se cierra', async ({ page }) => {
    await page.goto('/app');
    await expect(page.getByRole('navigation', { name: 'Menú principal' })).toBeHidden();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const panel = page.getByRole('dialog', { name: 'ARZA ONE' });
    await expect(panel).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);

    await panel.getByRole('link', { name: 'Proyectos' }).click();
    await expect(page).toHaveURL(/\/app\/proyectos$/);
    await expect(panel).toBeHidden();
  });

  test('la página no se desborda a lo ancho', async ({ page }) => {
    await page.goto('/app/sistema-de-diseno');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
