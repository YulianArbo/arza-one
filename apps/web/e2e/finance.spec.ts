import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Facturas y recaudos (B31): la lista con sus estados, el estado vacío y los formularios de
// solicitud, recaudo y nota crédito, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y
// oscuro. Datos ficticios.

const PATH = '/app/finanzas/facturas';
const MILESTONE = '01999a00-0000-7000-8000-0000000fa601';
const PARTY = {
  id: '01999a00-0000-7000-8000-0000000fa501',
  name: 'Comercializadora Andina S.A.S.',
};

const REQUESTED = {
  id: '01999a00-0000-7000-8000-0000000fa701',
  code: 'FAC-2026-0001',
  party: PARTY,
  milestone_id: MILESTONE,
  requested_amount: '1000.00',
  status: 'requested',
  issue_date: null,
  due_date: null,
  subtotal: null,
  tax_total: null,
  withholding_total: null,
  total: null,
  fiscal_number: null,
  fiscal_uuid: null,
  fiscal_file_id: null,
  paid_total: '0.00',
  balance: null,
  version: 1,
};

const ISSUED = {
  ...REQUESTED,
  id: '01999a00-0000-7000-8000-0000000fa801',
  code: 'FAC-2026-0002',
  milestone_id: '01999a00-0000-7000-8000-0000000fa602',
  status: 'issued',
  issue_date: '2026-11-08',
  due_date: '2026-12-08',
  subtotal: '1000.00',
  tax_total: '190.00',
  withholding_total: '0.00',
  total: '1190.00',
  fiscal_number: 'FE-001',
  fiscal_file_id: '01999a00-0000-7000-8000-0000000fa401',
  balance: '1190.00',
  version: 3,
};

const MILESTONES = {
  data: [
    {
      id: MILESTONE,
      project_code: 'PRY-2026-0001',
      project_name: 'Implementación',
      party: PARTY,
      contract_id: null,
      name: 'Entrega',
      amount: '1000.00',
    },
  ],
};

function api(invoices: readonly object[]): ApiRoutes {
  return {
    '/v1/finance/invoices': { body: { data: invoices } },
    '/v1/finance/invoices/billable-milestones': { body: MILESTONES },
  };
}

const DIALOGS = [
  { trigger: 'Solicitar factura', title: 'Solicitar factura desde un hito' },
  { trigger: 'Registrar recaudo', title: 'Recaudo de FAC-2026-0002' },
  { trigger: 'Nota crédito', title: 'Nota crédito de FAC-2026-0002' },
  { trigger: 'Anular', title: 'Anular FAC-2026-0001' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Facturas en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que Comercial (B22): equipo con poca memoria y servidor recién encendido.
    test.slow();

    test('la lista muestra cada factura con su estado y sus acciones', async ({
      page,
      consoleErrors,
    }) => {
      await useTheme(page, theme);
      await mockApi(page, api([REQUESTED, ISSUED]));
      await page.goto(PATH);
      const list = page.getByRole('list', { name: 'Facturas y solicitudes' });
      await expect(list.getByText('Solicitada', { exact: true })).toBeVisible();
      await expect(list.getByText('Emitida', { exact: true })).toBeVisible();
      await expect(list.getByText('Número: FE-001')).toBeVisible();
      await expect(list.getByRole('button', { name: 'Aprobar' })).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('sin facturas explica qué aparecerá', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, api([]));
      await page.goto(PATH);
      await expect(page.getByText('Aún no hay facturas', { exact: true })).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    for (const dialog of DIALOGS) {
      test(`el formulario «${dialog.trigger}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, api([REQUESTED, ISSUED]));
        await page.goto(PATH);
        await page.getByRole('button', { name: dialog.trigger, exact: true }).click();
        await expect(page.getByRole('dialog', { name: dialog.title })).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}
