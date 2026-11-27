import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Multiempresa (B48): la lista de empresas del operador y la empresa con su marca y su
// exportación, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro. Datos
// ficticios; nada sale del navegador.

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const TENANT = {
  id: ID(1),
  legal_name: 'Cliente Uno S.A.S.',
  trade_name: null,
  tax_id: '900123456-8',
  status: 'suspended',
  is_operator: false,
  plan: 'basic',
  limits: { max_internal_users: 10, max_portal_users: 20, storage_mb: 5120, ai_assistant: false },
  usage: { internal_users: 4, portal_users: 2, storage_mb: 300 },
  suspended_at: '2026-11-27T15:00:00.000Z',
  suspension_reason: 'Contrato terminado por falta de pago.',
  deletion_due_on: '2026-12-27',
  closed_at: null,
  last_export_at: '2026-11-27T14:00:00.000Z',
  created_at: '2026-11-01T15:00:00.000Z',
  version: 5,
};

const OPERATOR = {
  ...TENANT,
  id: ID(2),
  legal_name: 'ARZA TECH S.A.S.',
  tax_id: '900000000-0',
  status: 'active',
  is_operator: true,
  plan: 'enterprise',
  limits: {
    max_internal_users: null,
    max_portal_users: null,
    storage_mb: 512000,
    ai_assistant: true,
  },
  suspended_at: null,
  suspension_reason: null,
  deletion_due_on: null,
  last_export_at: null,
};

const API: ApiRoutes = {
  '/v1/platform/tenants': { body: { data: [OPERATOR, TENANT] } },
  '/v1/tenant': {
    body: {
      id: ID(2),
      legal_name: 'ARZA TECH S.A.S.',
      trade_name: 'ARZA TECH',
      tax_id: '900000000-0',
      version: 3,
    },
  },
  '/v1/sites': { body: { data: [] } },
  '/v1/me/branding': {
    body: { display_name: 'ARZA TECH', primary_color: '#1F4E79', has_logo: false, version: 3 },
  },
  '/v1/tenant/exports': {
    body: {
      data: [
        {
          id: ID(30),
          status: 'ready',
          requested_at: '2026-11-27T15:00:00.000Z',
          ready_at: '2026-11-27T15:05:00.000Z',
          expires_at: '2026-12-04T15:05:00.000Z',
          size_bytes: 3145728,
          tables: 191,
          rows: 1250,
          files: 12,
          manifest_sha256: 'a'.repeat(64),
        },
      ],
    },
  },
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Multiempresa B48 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    test('el operador ve las empresas con su plan, uso y estado, sin violaciones', async ({
      page,
      consoleErrors,
    }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/administracion/empresas');
      await expect(
        page.getByRole('heading', { name: 'Empresas de la plataforma', level: 1 }),
      ).toBeVisible();
      await expect(page.getByText('Se elimina el 27/12/2026')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancelar eliminación' })).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('la empresa muestra su marca y su exportación, sin violaciones', async ({
      page,
      consoleErrors,
    }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/administracion/empresa');
      await expect(page.getByRole('heading', { name: 'Marca de la empresa' })).toBeVisible();
      await expect(page.getByText('191 tablas, 1.250 filas, 12 archivos')).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
