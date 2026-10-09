import type { Page } from '@playwright/test';

import {
  INTERNAL_SESSION,
  PENDING_SESSIONS,
  fulfillJson,
  mockApi,
  mockSession,
} from './support/api-mock';
import { E2E_API_URL } from './support/environment';
import { expect, test } from './support/fixtures';

// Segundo factor y sesiones activas (B09) con la API simulada. El recorrido contra la API real
// está en las pruebas de integración de apps/api (test/int/iam).

const PASSWORD = 'mango biche con sal y limon';
const SETUP = {
  secret: 'AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH',
  otpauth_uri: 'otpauth://totp/ARZA%20ONE:ana%40demo-uno.test?secret=AAAA&issuer=ARZA%20ONE',
  expires_at: '2026-10-09T20:45:00.000Z',
};
const CODES = Array.from({ length: 10 }, (_, index) => `ABCD-EFGH-JKMN-PQR${String(index + 2)}`);

/** Registra el cuerpo y el código antifalsificación de cada POST y responde lo indicado. */
async function capturePost(page: Page, path: string, body: unknown) {
  const calls: { body: unknown; csrf: string | undefined }[] = [];
  await page.route(`${E2E_API_URL}${path}`, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    calls.push({ body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] });
    return fulfillJson(route, 200, body);
  });
  return calls;
}

test.describe('iniciar sesión con segundo factor', () => {
  test('la contraseña lleva al código y el código, a donde iba', async ({ page }) => {
    await mockSession(page, 'none');
    await page.goto('/app/estado-del-sistema');
    await expect(page).toHaveURL(/\/iniciar-sesion\?volver=/);
    await capturePost(page, '/v1/auth/login', PENDING_SESSIONS.second_factor);
    await mockSession(page, 'second_factor');
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    await page.getByLabel('Correo electrónico').fill('ana@demo-uno.test');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/segundo-factor\?volver=%2Fapp%2Festado-del-sistema$/);

    const verify = await capturePost(page, '/v1/auth/mfa/verify', INTERNAL_SESSION);
    await mockSession(page, 'internal');
    await page.getByLabel('Código de seis dígitos').fill('123456');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).toHaveURL(/\/app\/estado-del-sistema$/);
    expect(verify[0]).toEqual({ body: { code: '123456' }, csrf: INTERNAL_SESSION.csrf_token });
  });

  test('una pantalla de la aplicación con la sesión a medias lleva a configurarlo', async ({
    page,
  }) => {
    await mockSession(page, 'second_factor_setup');
    await page.goto('/app/perfil');
    await expect(page).toHaveURL(/\/segundo-factor\/configurar\?volver=%2Fapp%2Fperfil$/);
    await expect(page.getByRole('button', { name: 'Mostrar el código QR' })).toBeVisible();
  });
});

test.describe('configurar el segundo factor', () => {
  test('QR, primer código y los diez códigos de recuperación', async ({ page }) => {
    await mockSession(page, 'second_factor_setup');
    await mockApi(page, { '/v1/auth/mfa/setup': { body: SETUP } });
    const confirm = await capturePost(page, '/v1/auth/mfa/setup/confirm', {
      recovery_codes: CODES,
      session: INTERNAL_SESSION,
    });
    await page.goto('/segundo-factor/configurar');
    await page.getByRole('button', { name: 'Mostrar el código QR' }).click();
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    await expect(page.getByText('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH')).toBeVisible();
    await page.getByLabel('Código de seis dígitos').fill('654321');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    const codes = page.getByRole('list', { name: 'Códigos de recuperación' });
    await expect(codes.getByRole('listitem')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await page.getByLabel(/Guardé mis códigos/).check();
    await mockSession(page, 'internal');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/app$/);
    expect(confirm[0]?.body).toEqual({ code: '654321' });
  });
});

const CURRENT = {
  id: '01999a00-0000-7000-8000-00000000b001',
  created_at: '2026-10-09T13:00:00.000Z',
  last_seen_at: '2026-10-09T20:10:00.000Z',
  ip: '10.0.0.1',
  browser: 'Chrome',
  os: 'Windows',
  current: true,
  pending_second_factor: false,
};
const PHONE = {
  ...CURRENT,
  id: '01999a00-0000-7000-8000-00000000b002',
  os: 'Android',
  current: false,
};

test.describe('sesiones activas', () => {
  test('cierra la sesión de otro equipo después de confirmar', async ({ page }) => {
    let closed = false;
    await mockApi(page, {
      '/v1/me/sessions': () => ({ body: { data: closed ? [CURRENT] : [CURRENT, PHONE] } }),
    });
    await page.route(`${E2E_API_URL}/v1/me/sessions/${PHONE.id}/revoke`, async (route) => {
      closed = true;
      await fulfillJson(route, 200, {});
    });
    await page.goto('/app/perfil/sesiones');
    await expect(page.getByText('Chrome en Android')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('¿Cerrar la sesión de Chrome en Android?');
    await dialog.getByRole('button', { name: 'Sí, cerrar' }).click();
    await expect(page.getByText(/Cerramos la sesión de Chrome en Android/)).toBeVisible();
    await expect(page.getByText('Solo tiene abierta esta sesión.')).toBeVisible();
  });
});
