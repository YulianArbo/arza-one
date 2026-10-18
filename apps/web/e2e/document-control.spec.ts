import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Control documental del SGC (B19): Listado Maestro, solicitudes de acción documental y su ficha,
// sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro.

const DOCUMENT = '01999a00-0000-7000-8000-00000000b101';
const PROCESS = '01999a00-0000-7000-8000-00000000b401';
const REQUEST = '01999a00-0000-7000-8000-00000000b601';

const ENTRY = {
  document_id: DOCUMENT,
  code: 'PR-SGC-001',
  title: 'Control de documentos',
  doc_type: 'PR',
  doc_type_label: 'Procedimiento',
  process: { id: PROCESS, code: 'SGC', name: 'Gestión de la Calidad' },
  version_label: '03',
  effective_date: '2025-03-15',
  status: 'current',
  owner_position: 'Coordinador de Calidad',
};

const REQUEST_VIEW = {
  id: REQUEST,
  code: 'SAD-2026-0001',
  action: 'create',
  status: 'in_analysis',
  title: 'Control de registros',
  justification: 'El proceso necesita un procedimiento para sus registros.',
  document: null,
  doc_type: 'PR',
  process: { id: PROCESS, code: 'SGC', name: 'Gestión de la Calidad' },
  requested_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Carlos Ruiz' },
  requested_at: '2026-10-15T14:00:00.000Z',
  decided_by: null,
  decided_at: null,
  decision_note: null,
  executed_at: null,
  workflow_instance_id: null,
  step: 'En análisis',
  actions: ['approve', 'reject'],
  version: 2,
};

const API: ApiRoutes = {
  '/v1/master-list': { body: { data: [ENTRY], total: 1 } },
  '/v1/change-requests': { body: { data: [REQUEST_VIEW], next_cursor: null } },
  [`/v1/change-requests/${REQUEST}`]: { body: REQUEST_VIEW },
  '/v1/org-units': {
    body: {
      data: [
        {
          id: PROCESS,
          parent_id: null,
          code: 'SGC',
          name: 'Gestión de la Calidad',
          kind: 'process',
          owner_position_id: null,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
  '/v1/catalogs/document_types': {
    body: {
      key: 'document_types',
      name: 'Tipos de documento',
      description: null,
      items: [
        {
          id: PROCESS,
          code: 'PR',
          label: 'Procedimiento',
          sort_order: 10,
          is_active: true,
          version: 1,
        },
      ],
      version: 1,
    },
  },
};

const PAGES = [
  { path: '/app/documentos/listado-maestro', ready: 'PR-SGC-001', name: 'el Listado Maestro' },
  { path: '/app/documentos/solicitudes', ready: 'SAD-2026-0001', name: 'las solicitudes' },
  {
    path: `/app/documentos/solicitudes/${REQUEST}`,
    ready: 'Rechazar',
    name: 'la ficha de la solicitud',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`control documental en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
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
  });
}
