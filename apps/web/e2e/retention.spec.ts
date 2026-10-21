import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Retención, disposición final y búsqueda global (B21): tabla de retención, propuestas, ficha de
// una propuesta y resultados de la búsqueda, sin violaciones de accesibilidad WCAG 2.2 AA en modo
// claro y oscuro.

const DOCUMENT = '01999a00-0000-7000-8000-00000000b101';
const RULE = '01999a00-0000-7000-8000-00000000e001';
const PROPOSAL = '01999a00-0000-7000-8000-00000000e101';

const RULE_VIEW = {
  id: RULE,
  code: 'CON-01',
  name: 'Contratos con clientes',
  doc_type: 'CT',
  doc_type_label: 'Contrato',
  process: null,
  active_years: 2,
  archive_years: 8,
  disposition: 'destroy',
  legal_basis: 'Ley 962 de 2005, art. 28',
  is_active: true,
  documents: 4,
  version: 1,
};

const PROPOSAL_VIEW = {
  id: PROPOSAL,
  code: 'DIS-2026-0001',
  period: '2026-10-01',
  status: 'review',
  to_destroy: 1,
  to_keep: 0,
  created_at: '2026-10-01T11:10:00.000Z',
  sent_by: null,
  sent_at: null,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  executed_at: null,
  has_certificate: false,
  workflow_instance_id: null,
  step: 'Revisión de Calidad',
  actions: ['send'],
  can_edit_items: true,
  version: 2,
  items: [
    {
      id: '01999a00-0000-7000-8000-00000000e201',
      document: {
        id: DOCUMENT,
        code: 'DOC-2015-0001',
        title: 'Contrato de soporte',
        doc_type: 'CT',
        status: 'current',
      },
      rule: { id: RULE, code: 'CON-01', name: 'Contratos con clientes', disposition: 'destroy' },
      due_on: '2025-03-15',
      action: 'destroy',
      keep_reason: null,
      executed_at: null,
      version: 1,
    },
  ],
};

const API: ApiRoutes = {
  '/v1/retention-rules': { body: { data: [RULE_VIEW], unassigned_documents: 0 } },
  '/v1/dispositions': { body: { data: [PROPOSAL_VIEW], next_cursor: null } },
  [`/v1/dispositions/${PROPOSAL}`]: { body: PROPOSAL_VIEW },
  '/v1/documents/search': {
    body: {
      data: [
        {
          id: DOCUMENT,
          code: 'PR-SGC-001',
          title: 'Control de documentos',
          doc_type: 'PR',
          classification: 'internal',
          status: 'current',
          snippet: 'Procedimiento de [[gestión]] documental',
        },
      ],
    },
  },
  '/v1/parties': { body: { data: [], next_cursor: null } },
};

const PAGES = [
  { path: '/app/documentos/retencion', ready: 'CON-01', name: 'la tabla de retención' },
  { path: '/app/documentos/disposicion', ready: 'DIS-2026-0001', name: 'las propuestas' },
  {
    path: `/app/documentos/disposicion/${PROPOSAL}`,
    ready: 'Enviar a aprobación',
    name: 'la ficha de la propuesta',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`retención y búsqueda en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que documentos (B18): equipo con poca memoria y servidor recién encendido.
    test.slow();
    for (const page of PAGES) {
      test(`${page.name} no tiene violaciones de accesibilidad`, async ({
        page: browser,
        consoleErrors,
      }) => {
        await useTheme(browser, theme);
        await mockApi(browser, API);
        await browser.goto(page.path);
        await expect(browser.getByText(page.ready, { exact: true }).first()).toBeVisible();
        expect(await accessibilityViolations(browser)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }

    test('la búsqueda global muestra lo encontrado resaltado y accesible', async ({
      page: browser,
      consoleErrors,
    }) => {
      await useTheme(browser, theme);
      await mockApi(browser, API);
      await browser.goto('/app');
      await browser.getByRole('button', { name: /Buscar en todo/u }).click();
      const search = browser.getByRole('dialog', { name: 'Buscar en todo' });
      await search.getByRole('searchbox', { name: 'Qué busca' }).fill('gestion');
      await expect(search.getByRole('link', { name: /PR-SGC-001/u })).toBeVisible();
      await expect(search.locator('mark', { hasText: 'gestión' })).toBeVisible();
      expect(await accessibilityViolations(browser)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}
