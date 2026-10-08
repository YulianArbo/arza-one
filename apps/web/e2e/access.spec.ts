import type { Page } from '@playwright/test';

import { INTERNAL_SESSION, apiError, fulfillJson, mockApi, mockSession } from './support/api-mock';
import { E2E_API_URL } from './support/environment';
import { accessibilityViolations, expect, test } from './support/fixtures';

// Pantallas de acceso (B08, numeral 16.7) con la API simulada. El recorrido contra la API real
// está en las pruebas de integración de apps/api (test/int/iam).

const TOKEN = 'a'.repeat(43);
const PASSWORD = 'mango biche con sal y limon';

const ME = {
  ...INTERNAL_SESSION.user,
  last_login_at: '2026-10-09T20:15:00.000Z',
  password_changed_at: null,
};

/** Registra el cuerpo y las cabeceras de cada POST a la ruta dada y responde lo indicado. */
async function capturePost(page: Page, path: string, status: number, body: unknown = null) {
  const calls: { body: unknown; csrf: string | undefined }[] = [];
  await page.route(`${E2E_API_URL}${path}`, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    calls.push({ body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] });
    if (status === 204) {
      return route.fulfill({
        status,
        headers: {
          'Access-Control-Allow-Origin': new URL(page.url()).origin,
          'Access-Control-Allow-Credentials': 'true',
        },
      });
    }
    return fulfillJson(route, status, body);
  });
  return calls;
}

test.describe('iniciar sesión', () => {
  test('sin sesión, la aplicación pide iniciar sesión y luego vuelve a donde iba', async ({
    page,
  }) => {
    await mockSession(page, 'none');
    await page.goto('/app/estado-del-sistema');
    await expect(page).toHaveURL(/\/iniciar-sesion\?volver=%2Fapp%2Festado-del-sistema$/);

    const login = await capturePost(page, '/v1/auth/login', 200, INTERNAL_SESSION);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    await page.getByLabel('Correo electrónico').fill('ana@demo-uno.test');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/app\/estado-del-sistema$/);
    expect(login[0]?.body).toEqual({ email: 'ana@demo-uno.test', password: PASSWORD });
  });

  test('con datos equivocados muestra el mensaje de la API', async ({ page }) => {
    await mockSession(page, 'none');
    const message = 'El correo o la contraseña no son correctos.';
    await capturePost(page, '/v1/auth/login', 401, apiError('INVALID_CREDENTIALS', message, 'c1'));
    await page.goto('/iniciar-sesion');
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    await page.getByLabel('Correo electrónico').fill('ana@demo-uno.test');
    await page.getByLabel('Contraseña').fill('equivocada');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
  });
});

test.describe('enlaces del correo', () => {
  test('activar la cuenta quita la llave de la dirección y lleva a iniciar sesión', async ({
    page,
  }) => {
    await mockSession(page, 'none');
    const accept = await capturePost(page, '/v1/auth/invitation/accept', 204);
    await page.goto(`/activar-cuenta#token=${TOKEN}`);
    await expect(page.getByRole('button', { name: 'Activar cuenta' })).toBeEnabled();
    expect(new URL(page.url()).hash).toBe('');
    await page.getByLabel('Su nombre').fill('Ana Pérez');
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Repita la contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion\?motivo=cuenta-activada$/);
    await expect(page.getByText('Su cuenta quedó activa')).toBeVisible();
    expect(accept[0]?.body).toEqual({
      token: TOKEN,
      display_name: 'Ana Pérez',
      password: PASSWORD,
    });
  });

  test('recuperar la contraseña muestra el mismo mensaje siempre', async ({ page }) => {
    await mockSession(page, 'none');
    const message =
      'Si el correo corresponde a una cuenta activa, en unos minutos recibirá un enlace.';
    await capturePost(page, '/v1/auth/password/forgot', 202, { message });
    await page.goto('/iniciar-sesion');
    await page.getByRole('link', { name: '¿Olvidó su contraseña?' }).click();
    await expect(page.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled();
    await page.getByLabel('Correo electrónico').fill('quien-sea@demo-uno.test');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText(message)).toBeVisible();
  });
});

test.describe('perfil y salida', () => {
  test('cambiar la contraseña envía el código antifalsificación y pide entrar de nuevo', async ({
    page,
  }) => {
    await mockApi(page, { '/v1/me': { body: ME } });
    const change = await capturePost(page, '/v1/me/password', 204);
    await page.goto('/app/perfil');
    await expect(page.getByText('ana@demo-uno.test')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled();
    await page.getByLabel('Contraseña actual').fill(PASSWORD);
    await page.getByLabel('Contraseña nueva').fill('arepa de choclo con queso');
    await page.getByLabel('Repita la contraseña').fill('arepa de choclo con queso');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion\?motivo=contrasena-cambiada$/);
    expect(change[0]?.csrf).toBe(INTERNAL_SESSION.csrf_token);
  });

  test('cerrar sesión desde el menú del usuario', async ({ page }) => {
    const logout = await capturePost(page, '/v1/auth/logout', 204);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Menú del usuario' }).click();
    await expect(page.getByText('Ana Pérez')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion\?motivo=sesion-cerrada$/);
    expect(logout[0]?.csrf).toBe(INTERNAL_SESSION.csrf_token);
  });

  test('Mi perfil no tiene violaciones de accesibilidad', async ({ page, consoleErrors }) => {
    await mockApi(page, { '/v1/me': { body: ME } });
    await page.goto('/app/perfil');
    await expect(page.getByText('ana@demo-uno.test')).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test('las pantallas de acceso no se indexan', async ({ page }) => {
  await mockSession(page, 'none');
  for (const path of ['/iniciar-sesion', '/activar-cuenta', '/recuperar-contrasena']) {
    const response = await page.goto(path);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
});
