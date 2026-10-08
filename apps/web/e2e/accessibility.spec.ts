import { mockHealthyApi, mockSession } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

const TOKEN = 'a'.repeat(43);

// Pantallas de B04 y B08, el texto que indica que terminaron de cargar y la sesión simulada.
const PAGES = [
  { path: '/', ready: 'ARZA TECH S.A.S.' },
  { path: '/app', ready: 'Mis tareas' },
  { path: '/app/estado-del-sistema', ready: 'Todo funciona' },
  { path: '/app/sistema-de-diseno', ready: 'Estados de pantalla' },
  { path: '/app/comercial', ready: 'Este módulo está en construcción' },
  { path: '/portal', ready: 'Su portal estará disponible pronto', session: 'portal' },
  { path: '/iniciar-sesion', ready: '¿Olvidó su contraseña?', session: 'none' },
  { path: '/recuperar-contrasena', ready: 'Enviar enlace', session: 'none' },
  { path: `/activar-cuenta#token=${TOKEN}`, ready: 'Activar cuenta', session: 'none' },
  { path: `/restablecer-contrasena#token=${TOKEN}`, ready: 'Guardar contraseña', session: 'none' },
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
