import { mockApi, mockSession } from './support/api-mock';
import { accessibilityViolations, askCookies, expect, test, useTheme } from './support/fixtures';

// Vitrina pública (B22A; B41): lo que depende de otros bloques lo dice y no simula funcionar. La
// verificación de documentos funciona desde el B25; la cotización, el contacto, los textos legales
// y el aviso de cookies, desde el B41.

const NOTICE = {
  available: true,
  notice: {
    id: '01999a00-0000-7000-8000-00000000f042',
    title: 'Autorización de contactos',
    body: 'Texto de prueba del aviso de autorización.',
    version_number: 1,
    purposes: ['COMMERCIAL'],
  },
};

const NOT_PUBLISHED = {
  status: 404,
  body: {
    error: {
      code: 'SITE_RECORD_NOT_FOUND',
      message: 'La política de tratamiento todavía no se ha publicado.',
      details: [],
      correlation_id: 'e2e-sitio',
    },
  },
};

for (const theme of ['light', 'dark'] as const) {
  test(`la vitrina no tiene violaciones de accesibilidad en modo ${theme}`, async ({ page }) => {
    await useTheme(page, theme);
    await askCookies(page);
    await mockSession(page, 'none');
    await mockApi(page, { '/v1/public/forms/notice': { body: NOTICE } });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Innovando el presente');
    await expect(page.getByRole('region', { name: 'Usamos cookies' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Solicitar cotización' })).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

test('lo pendiente dice «Disponible pronto»; cotizar y contactar ya funcionan', async ({
  page,
}) => {
  await mockSession(page, 'none');
  await mockApi(page, { '/v1/public/forms/notice': { body: NOTICE } });
  await page.goto('/');
  for (const id of ['proyectos', 'noticias']) {
    await expect(page.locator(`#${id}`).getByText('Disponible pronto')).toBeVisible();
  }
  await expect(page.locator('#cotizar').getByRole('checkbox')).not.toBeChecked();
  await expect(
    page.locator('#contacto').getByRole('button', { name: 'Enviar mensaje' }),
  ).toBeVisible();
  const verify = page.locator('#verificar').getByRole('link', { name: 'Verificar un documento' });
  await expect(verify).toHaveAttribute('href', '/verificar');
  const pqrsf = page.locator('#pqrsf').getByRole('link', { name: 'Radicar o consultar una PQRSF' });
  await expect(pqrsf).toHaveAttribute('href', '/pqrsf');
});

test('el botón «Iniciar sesión» lleva al acceso', async ({ page }) => {
  await mockSession(page, 'none');
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});

test('los textos legales del pie muestran lo publicado o que no se ha publicado', async ({
  page,
}) => {
  await mockSession(page, 'none');
  await mockApi(page, { '/v1/public/legal/privacy-policy': NOT_PUBLISHED });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Legal' })
    .getByRole('link', { name: 'Política de tratamiento de datos' })
    .click();
  await expect(page).toHaveURL(/\/legal\/privacidad$/);
  await expect(page.getByText(/todavía no se ha publicado/u)).toBeVisible();
  await page.goto('/legal/cookies');
  await expect(page.getByRole('heading', { name: 'Política de cookies' })).toBeVisible();
  await expect(page.getByText(/Versión 1 · Vigente desde el 22\/11\/2026/u)).toBeVisible();
  const missing = await page.goto('/legal/otro');
  expect(missing?.status()).toBe(404);
});

test('con las cookies rechazadas, el navegador solo tiene las necesarias (ficha 17.18)', async ({
  page,
  context,
}) => {
  await askCookies(page);
  await mockSession(page, 'none');
  await mockApi(page, {
    '/v1/public/cookie-consent': { status: 201, body: { decided_at: '2026-11-22T15:00:00.000Z' } },
  });
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Usamos cookies' });
  await banner.getByRole('button', { name: 'Rechazar las no necesarias' }).click();
  await expect(banner).toBeHidden();
  await page.getByRole('button', { name: 'Oscuro' }).first().click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Usamos cookies' })).toBeHidden();
  const names = (await context.cookies()).map((cookie) => cookie.name);
  expect(names).toEqual(['arza_cookie_consent']);
});

test('al aceptar las preferencias, el sitio recuerda el modo oscuro', async ({ page, context }) => {
  await askCookies(page);
  await mockSession(page, 'none');
  await mockApi(page, {
    '/v1/public/cookie-consent': { status: 201, body: { decided_at: '2026-11-22T15:00:00.000Z' } },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Aceptar todas' }).click();
  await page.getByRole('button', { name: 'Oscuro' }).first().click();
  const names = (await context.cookies()).map((cookie) => cookie.name).sort();
  expect(names).toEqual(['arza_cookie_consent', 'arza_theme']);
});
