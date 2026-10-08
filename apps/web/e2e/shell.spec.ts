import { expect, test, waitForAppShell } from './support/fixtures';

// Barra superior (zona 2 de la figura 16.3) y preferencia de modo claro u oscuro.

test('Ctrl K abre la búsqueda global desde cualquier pantalla', async ({ page }) => {
  await page.goto('/app');
  await waitForAppShell(page);
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Buscar en todo' });
  await expect(search).toBeVisible();
  await expect(search.getByRole('searchbox', { name: 'Qué busca' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
});

test('el modo oscuro se elige en el menú y se recuerda al volver', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: /^Apariencia/ }).click();
  await page.getByRole('menuitemradio', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveClass('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(page.getByRole('button', { name: 'Apariencia: Oscuro' })).toBeVisible();
});

test('sin preferencia guardada sigue el modo del sistema operativo', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/app');
  await expect(page.locator('html')).not.toHaveClass(/light|dark/);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe('rgb(10, 20, 32)');
});

test('una dirección inexistente del sitio responde 404 con una página clara', async ({ page }) => {
  const response = await page.goto('/no-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
});

// Dentro de la aplicación la pantalla de carga ya empezó a enviarse con código 200; Next.js
// marca entonces la página como no indexable (documentación de loading.tsx, «Status Codes»).
test('un módulo inexistente muestra la misma página y no se indexa', async ({ page }) => {
  await page.goto('/app/no-existe');
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});
