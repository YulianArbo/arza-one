import {
  EVALUATED,
  EXECUTIVE,
  ME,
  REQUIREMENT,
  SALES_ROWS,
  SCORECARD,
} from '../src/features/direction/direction-fixtures';
import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Dirección (B46): tableros, cuadro de mando y normograma, sin violaciones de accesibilidad
// WCAG 2.2 AA en modo claro y oscuro. Datos ficticios.

const API: ApiRoutes = {
  '/v1/dashboards/executive/data': { body: EXECUTIVE },
  '/v1/dashboards/executive/drilldown': { body: SALES_ROWS },
  '/v1/dashboards/compliance/data': { body: { ...EXECUTIVE, figures: [] } },
  '/v1/dashboards/scorecard/data': { body: { ...SCORECARD, scope: 'all' } },
  '/v1/qms/legal-requirements': {
    body: { data: [REQUIREMENT, EVALUATED], current_period: 'S2 2026' },
  },
  '/v1/qms/strategic-objectives': { body: { data: [] } },
  '/v1/qms/indicators': { body: { data: [] } },
  '/v1/qms/people': { body: { data: [ME] } },
  '/v1/org-units': { body: { data: [] } },
};

const SCREENS = [
  { path: '/tablero-gerencial', heading: 'Tablero gerencial', dialog: 'Ver registros' },
  { path: '/cuadro-de-mando', heading: 'Cuadro de mando', dialog: 'Registrar objetivo' },
  {
    path: '/normograma',
    heading: 'Normograma y evaluación de cumplimiento',
    dialog: 'Registrar requisito',
  },
  {
    path: '/normograma',
    heading: 'Normograma y evaluación de cumplimiento',
    dialog: 'Cargar archivo',
  },
  { path: '/normograma', heading: 'Normograma y evaluación de cumplimiento', dialog: 'Evaluar' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Dirección B46 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    for (const screen of SCREENS) {
      test(`«${screen.heading}» con «${screen.dialog}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(`/app/direccion${screen.path}`);
        await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        await page.getByRole('button', { name: screen.dialog, exact: true }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }

    test('la portada de Dirección lleva al tablero de cumplimiento', async ({ page }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/direccion');
      await page.getByRole('main').getByRole('link', { name: 'Tablero de cumplimiento' }).click();
      await expect(
        page.getByRole('heading', { name: 'Tablero de cumplimiento', level: 1 }),
      ).toBeVisible();
    });
  });
}
