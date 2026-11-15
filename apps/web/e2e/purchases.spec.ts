import {
  EVALUATION,
  OPTIONS,
  ORDER,
  QUOTE,
  RECEIPT,
  REQUEST,
  TRAVEL,
} from '../src/features/purchases/purchase-fixtures';
import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Compras, proveedores y viajes (B33): cada pantalla y su formulario principal, sin violaciones de
// accesibilidad WCAG 2.2 AA en modo claro y oscuro. Datos ficticios.

const APPROVED = { ...REQUEST, status: 'approved', version: 3, quotes: [QUOTE] };

const API: ApiRoutes = {
  '/v1/purchase-requests/options': { body: OPTIONS },
  '/v1/purchase-requests': { body: { data: [REQUEST, { ...APPROVED, code: 'SC-2026-0002' }] } },
  '/v1/purchase-orders': { body: { data: [{ ...ORDER, receipts: [RECEIPT] }] } },
  '/v1/supplier-evaluations': { body: { data: [EVALUATION] } },
  '/v1/travel-requests': { body: { data: [TRAVEL] } },
};

const SCREENS = [
  { path: '', heading: 'Compras', dialog: null },
  { path: '/solicitudes', heading: 'Solicitudes de compra', dialog: 'Nueva solicitud' },
  { path: '/cuadro-comparativo', heading: 'Cuadro comparativo', dialog: 'Agregar cotización' },
  {
    path: '/ordenes',
    heading: 'Órdenes de compra',
    dialog: 'Registrar la recepción de la orden OC-2026-0001',
  },
  { path: '/recepciones', heading: 'Recepciones', dialog: null },
  { path: '/proveedores', heading: 'Evaluación de proveedores', dialog: 'Evaluar proveedor' },
  { path: '/viajes', heading: 'Viajes y legalizaciones', dialog: 'Nueva solicitud de viaje' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Compras B33 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    for (const screen of SCREENS) {
      test(`«${screen.heading}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(`/app/compras${screen.path}`);
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

    test('el viajero legaliza su viaje y ve el saldo', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/compras/viajes');
      await page.getByRole('button', { name: 'Legalizar el viaje SV-2026-0001' }).click();
      await expect(page.getByRole('dialog').getByText(/Al viajero se le deben/u)).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('el menú lleva a Compras', async ({ page }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app');
      await page.getByRole('link', { name: 'Compras', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Compras', level: 1 })).toBeVisible();
      await expect(page.getByText('Activos: disponible pronto')).toBeVisible();
    });
  });
}
