import {
  EVALUATION,
  OPTIONS,
  ORDER,
  QUOTE,
  RECEIPT,
  REQUEST,
  TRAVEL,
} from '../src/features/purchases/purchase-fixtures';
import { apiError, fulfillJson, mockApi, mockSession, type ApiRoutes } from './support/api-mock';
import { E2E_API_URL } from './support/environment';
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
    dialog: 'Registrar recepción de la orden OC-2026-0001',
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
      await page.getByRole('button', { name: 'Legalizar viaje SV-2026-0001' }).click();
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
      await expect(page.getByRole('main').getByRole('link', { name: /^Activos/u })).toBeVisible();
    });
  });
}

test.describe('portada de Compras (B22B)', () => {
  test('«Nueva solicitud» abre el formulario de una solicitud nueva', async ({ page }) => {
    await mockApi(page, API);
    await page.goto('/app/compras');
    await page.getByRole('main').getByRole('link', { name: 'Nueva solicitud' }).click();
    await expect(page).toHaveURL(/\/app\/compras\/solicitudes\?nueva=1$/u);
    await expect(page.getByRole('dialog', { name: 'Nueva solicitud de compra' })).toBeVisible();
  });
});

test.describe('sesión vencida en un formulario (B22B F4d)', () => {
  test('al volver a entrar, encuentra lo que estaba escribiendo', async ({ page }) => {
    await mockApi(page, API);
    await page.route(`${E2E_API_URL}/v1/purchase-requests`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await mockSession(page, 'none');
      return fulfillJson(route, 401, apiError('UNAUTHENTICATED', 'Debe iniciar sesión.', 'c-1'));
    });
    await page.goto('/app/compras/solicitudes?nueva=1');
    const dialog = page.getByRole('dialog', { name: 'Nueva solicitud de compra' });
    await dialog.getByLabel('Centro de costo').selectOption({ label: 'CC-ADM · Administración' });
    await dialog.getByLabel('Descripción').fill('Portátiles para el equipo nuevo');
    await dialog.getByLabel('Valor estimado').fill('4500000');
    await dialog.getByRole('button', { name: 'Crear solicitud' }).click();
    await expect(page).toHaveURL(/motivo=sesion-vencida&volver=%2Fapp%2Fcompras%2Fsolicitudes/u);
    await mockSession(page, 'internal');
    await page.goto('/app/compras/solicitudes');
    await expect(page.getByText(/Guardamos lo que estaba escribiendo/u)).toBeVisible();
    await page.getByRole('button', { name: 'Nueva solicitud' }).click();
    const reopened = page.getByRole('dialog', { name: 'Nueva solicitud de compra' });
    await expect(reopened.getByLabel('Descripción')).toHaveValue('Portátiles para el equipo nuevo');
    await expect(reopened.getByLabel('Valor estimado')).toHaveValue('4500000');
    await expect(reopened.getByLabel('Centro de costo')).not.toHaveValue('');
  });
});
