import { mockApi, mockHealthyApi, mockSession, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';
import { PORTAL_API } from './support/portal-api';

const TOKEN = 'a'.repeat(43);

const SESSIONS = {
  data: [
    {
      id: '01999a00-0000-7000-8000-00000000b001',
      created_at: '2026-10-09T13:00:00.000Z',
      last_seen_at: '2026-10-09T20:10:00.000Z',
      ip: '10.0.0.1',
      browser: 'Chrome',
      os: 'Windows',
      current: true,
      pending_second_factor: false,
    },
  ],
};
const MFA = { required: true, enabled: true, confirmed_at: null, recovery_codes_remaining: 10 };
const ME = {
  id: '01999a00-0000-7000-8000-00000000a001',
  email: 'ana@demo-uno.test',
  display_name: 'Ana Pérez',
  kind: 'internal',
  last_login_at: null,
  password_changed_at: null,
  has_photo: false,
};
const PROFILE_API: ApiRoutes = { '/v1/me': { body: ME }, '/v1/me/mfa': { body: MFA } };

// Pantallas de B04, B08 y B09, el texto que indica que terminaron de cargar, la sesión simulada y
// las respuestas de la API que necesitan.
const PAGES = [
  { path: '/', ready: 'ARZA TECH S.A.S.' },
  { path: '/app', ready: 'Mis tareas' },
  { path: '/app/estado-del-sistema', ready: 'Todo funciona' },
  { path: '/app/sistema-de-diseno', ready: 'Estados de pantalla' },
  { path: '/app/direccion', ready: 'Tablero gerencial' },
  { path: '/portal', ready: 'Su espacio de cliente', session: 'portal', api: PORTAL_API },
  { path: '/iniciar-sesion', ready: '¿Olvidó su contraseña?', session: 'none' },
  { path: '/recuperar-contrasena', ready: 'Enviar enlace', session: 'none' },
  { path: `/activar-cuenta#token=${TOKEN}`, ready: 'Activar cuenta', session: 'none' },
  { path: `/restablecer-contrasena#token=${TOKEN}`, ready: 'Guardar contraseña', session: 'none' },
  { path: '/segundo-factor', ready: 'Verificar', session: 'second_factor' },
  {
    path: '/segundo-factor/configurar',
    ready: 'Mostrar el código QR',
    session: 'second_factor_setup',
  },
  { path: '/app/perfil', ready: 'Generar códigos nuevos', api: PROFILE_API },
  {
    path: '/app/perfil/sesiones',
    ready: 'Esta sesión',
    api: { '/v1/me/sessions': { body: SESSIONS } },
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad WCAG 2.2 AA en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const entry of PAGES) {
      const { path, ready } = entry;
      test(`${path.split('#')[0] ?? path} no tiene violaciones`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockHealthyApi(page);
        if ('session' in entry) await mockSession(page, entry.session);
        if ('api' in entry) await mockApi(page, entry.api);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        await expect(page.locator('html')).toHaveClass(theme);

        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test('la revisión de accesibilidad detecta un botón sin nombre', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByText('Mis tareas').first()).toBeVisible();
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'size-8 border';
    document.querySelector('main')?.append(button);
  });
  const violations = await accessibilityViolations(page);
  expect(violations.some((violation) => violation.startsWith('button-name'))).toBe(true);
});
