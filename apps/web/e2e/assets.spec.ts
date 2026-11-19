import {
  ASSET,
  ASSET_ID,
  ASSIGNED,
  ASSIGNEES,
  DONE_MAINTENANCE,
  MAINTENANCE,
  RESERVED,
  RETIRED,
  RETURNED_ASSIGNMENT,
} from '../src/features/assets/asset-fixtures';
import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Activos (B34): inventario, mantenimientos y sus formularios, sin violaciones de accesibilidad
// WCAG 2.2 AA en modo claro y oscuro. Datos ficticios.

const API: ApiRoutes = {
  '/v1/assets': { body: { data: [ASSET, RESERVED, ASSIGNED, RETIRED] } },
  [`/v1/assets/${ASSET_ID}`]: {
    body: { asset: ASSET, assignments: [RETURNED_ASSIGNMENT], maintenance: [DONE_MAINTENANCE] },
  },
  '/v1/asset-assignees': { body: ASSIGNEES },
  '/v1/asset-maintenance': { body: { data: [MAINTENANCE, DONE_MAINTENANCE] } },
};

const SCREENS = [
  { path: '', heading: 'Activos', dialog: 'Registrar activo' },
  { path: '', heading: 'Activos', dialog: 'Asignar ACT-2026-0001' },
  { path: '', heading: 'Activos', dialog: 'Dar de baja ACT-2026-0001' },
  { path: '', heading: 'Activos', dialog: 'Ver historial ACT-2026-0001' },
  {
    path: '/mantenimientos',
    heading: 'Mantenimientos de activos',
    dialog: 'Registrar como hecho el mantenimiento de ACT-2026-0001',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Activos B34 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    for (const screen of SCREENS) {
      test(`«${screen.heading}» con «${screen.dialog}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(`/app/compras/activos${screen.path}`);
        await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        await page.getByRole('button', { name: screen.dialog, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }

    test('la portada de Compras lleva al inventario de activos', async ({ page }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/compras');
      await page
        .getByRole('main')
        .getByRole('link', { name: /^Activos/u })
        .click();
      await expect(page.getByRole('heading', { name: 'Activos', level: 1 })).toBeVisible();
      await expect(page.getByText('Comodato CT-ADM-001-2026-0001 firmado')).toBeVisible();
    });
  });
}
