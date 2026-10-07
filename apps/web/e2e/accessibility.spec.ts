import { mockHealthyApi } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de B04 y el texto que indica que terminaron de cargar.
const PAGES = [
  { path: '/', ready: 'ARZA TECH S.A.S.' },
  { path: '/app', ready: 'Mis tareas' },
  { path: '/app/estado-del-sistema', ready: 'Todo funciona' },
  { path: '/app/sistema-de-diseno', ready: 'Estados de pantalla' },
  { path: '/app/comercial', ready: 'Este módulo está en construcción' },
  { path: '/portal', ready: 'Su portal estará disponible pronto' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad WCAG 2.2 AA en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockHealthyApi(page);
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
