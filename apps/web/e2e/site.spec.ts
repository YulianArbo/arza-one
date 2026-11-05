import { mockSession } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Vitrina pública (B22A): lo que depende de otros bloques lo dice y no simula funcionar. La
// verificación de documentos funciona desde el B25.

for (const theme of ['light', 'dark'] as const) {
  test(`la vitrina no tiene violaciones de accesibilidad en modo ${theme}`, async ({ page }) => {
    await useTheme(page, theme);
    await mockSession(page, 'none');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Innovando el presente');
    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

test('lo pendiente dice «Disponible pronto» y no hay formularios simulados', async ({ page }) => {
  await mockSession(page, 'none');
  await page.goto('/');
  for (const id of ['proyectos', 'noticias', 'cotizar', 'pqrsf']) {
    await expect(page.locator(`#${id}`).getByText('Disponible pronto')).toBeVisible();
  }
  // Desde el B25 la verificación de documentos funciona: lleva a su página.
  const verify = page.locator('#verificar').getByRole('link', { name: 'Verificar un documento' });
  await expect(verify).toHaveAttribute('href', '/verificar');
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.locator('main input')).toHaveCount(0);
});

test('el botón «Plataforma empresarial» lleva al acceso', async ({ page }) => {
  await mockSession(page, 'none');
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Plataforma empresarial' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});

test('los textos legales del pie existen y dicen que están en preparación', async ({ page }) => {
  await mockSession(page, 'none');
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Política de privacidad' })
    .click();
  await expect(page).toHaveURL(/\/legal\/privacidad$/);
  await expect(page.getByRole('heading', { name: 'Política de privacidad' })).toBeVisible();
  await expect(page.getByRole('main').getByText('Disponible pronto')).toBeVisible();
  const missing = await page.goto('/legal/otro');
  expect(missing?.status()).toBe(404);
});
