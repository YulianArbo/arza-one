import {
  BATCHES,
  BUDGET,
  BUDGET_DETAIL,
  BUDGET_ID,
  EXECUTION,
  EXPENSE,
  OPTIONS,
  PERIODS,
  PETTY_CASH,
} from '../src/features/finance/ledger-fixtures';
import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Presupuesto, gastos, caja menor, conciliación, certificación y cierre (B32): cada pantalla y su
// formulario principal, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro.
// Datos ficticios.

const API: ApiRoutes = {
  '/v1/finance/options': { body: OPTIONS },
  '/v1/finance/budgets': { body: { data: [BUDGET] } },
  [`/v1/finance/budgets/${BUDGET_ID}`]: { body: { data: BUDGET_DETAIL } },
  [`/v1/finance/budgets/${BUDGET_ID}/execution`]: { body: EXECUTION },
  '/v1/finance/expenses': { body: { data: [EXPENSE] } },
  '/v1/finance/petty-cash': { body: PETTY_CASH },
  '/v1/finance/bank-reconciliations': { body: { data: [] } },
  '/v1/finance/cost-certifications': { body: { data: [] } },
  '/v1/finance/cost-certifications/projects': { body: { data: [] } },
  '/v1/finance/periods': { body: PERIODS },
  '/v1/finance/exports': { body: BATCHES },
};

const SCREENS = [
  { path: 'presupuesto', heading: 'Presupuesto', dialog: 'Nuevo presupuesto' },
  { path: 'gastos', heading: 'Gastos', dialog: 'Registrar gasto' },
  { path: 'caja-menor', heading: 'Caja menor', dialog: 'Registrar movimiento' },
  { path: 'conciliaciones', heading: 'Conciliación bancaria', dialog: 'Nueva conciliación' },
  { path: 'certificaciones', heading: 'Certificación de costos', dialog: 'Nueva certificación' },
  { path: 'cierre', heading: 'Cierre y exportación contable', dialog: null },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Finanzas B32 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    for (const screen of SCREENS) {
      test(`«${screen.heading}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(`/app/finanzas/${screen.path}`);
        await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        if (screen.dialog !== null) {
          await page.getByRole('button', { name: screen.dialog, exact: true }).click();
          await expect(page.getByRole('dialog')).toBeVisible();
          expect(await accessibilityViolations(page)).toEqual([]);
        }
        expect(consoleErrors).toEqual([]);
      });
    }

    test('el presupuesto muestra sus líneas y la ejecución', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/finanzas/presupuesto');
      await page.getByRole('button', { name: 'Ver el presupuesto 2026' }).click();
      await expect(page.getByText('25,0 %')).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
