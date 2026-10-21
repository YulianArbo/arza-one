import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Documentos de B18: el explorador de expedientes y la ficha del documento sin violaciones de
// accesibilidad WCAG 2.2 AA en modo claro y oscuro, y quien no tiene permiso.

const ROOT = '01999a00-0000-7000-8000-00000000b001';
const FOLDER = '01999a00-0000-7000-8000-00000000b002';
const DOCUMENT = '01999a00-0000-7000-8000-00000000b101';
const VERSION = '01999a00-0000-7000-8000-00000000b201';

const FOLDER_BASE = {
  parent_id: null,
  kind: 'folder',
  entity_type: null,
  entity_id: null,
  entity_name: null,
  classification: 'internal',
  document_count: 0,
  version: 1,
};

const DOC = {
  id: DOCUMENT,
  code: 'PR-SGC-001',
  title: 'Control de documentos',
  doc_type: 'PR',
  doc_type_label: 'Procedimiento',
  is_controlled: true,
  process: { id: FOLDER, code: 'SGC', name: 'Gestión de la Calidad' },
  folder_id: FOLDER,
  classification: 'internal',
  owner_position: null,
  status: 'draft',
  current_version: null,
  open_version: { id: VERSION, label: '00', status: 'draft', effective_date: null },
  disposed_at: null,
  created_at: '2026-10-15T15:00:00.000Z',
  version: 1,
};

const DRAFT = {
  id: VERSION,
  document_id: DOCUMENT,
  number: 0,
  label: '00',
  status: 'draft',
  render_status: 'pending',
  title: 'Control de documentos',
  classification: 'internal',
  owner_position: null,
  change_summary: 'Creación del documento',
  review_note: null,
  source_file: null,
  pdf_file: null,
  created_by: { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' },
  created_at: '2026-10-15T15:00:00.000Z',
  submitted_at: null,
  approved_by: null,
  approved_at: null,
  effective_date: null,
  published_at: null,
  obsoleted_at: null,
  origin: 'platform',
  change_request: null,
  workflow_instance_id: null,
  step: 'Elaboración',
  actions: ['edit'],
  version: 1,
};

const DOCUMENTS_API: ApiRoutes = {
  '/v1/folders': {
    body: {
      data: [
        { ...FOLDER_BASE, id: ROOT, code: 'SGC', name: 'Sistema de Gestión de Calidad' },
        {
          ...FOLDER_BASE,
          id: FOLDER,
          parent_id: ROOT,
          code: 'SGC-SGC',
          name: 'Gestión de la Calidad',
          document_count: 1,
        },
      ],
    },
  },
  '/v1/documents': { body: { data: [DOC], next_cursor: null } },
  [`/v1/documents/${DOCUMENT}`]: { body: DOC },
  [`/v1/documents/${DOCUMENT}/versions`]: { body: { data: [DRAFT] } },
  [`/v1/documents/${DOCUMENT}/links`]: { body: { data: [] } },
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`documentos en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que archivos (B14): equipo con poca memoria y servidor recién encendido.
    test.slow();
    test('el explorador no tiene violaciones de accesibilidad', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, DOCUMENTS_API);
      await page.goto('/app/documentos');
      await expect(page.getByRole('link', { name: 'PR-SGC-001' })).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('la ficha no tiene violaciones de accesibilidad', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, DOCUMENTS_API);
      await page.goto(`/app/documentos/${DOCUMENT}`);
      await expect(page.getByText('Convirtiendo a PDF…')).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('quien no ve documentos', () => {
  test('ve «Sin permiso» si escribe la dirección', async ({ page }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, DOCUMENTS_API);
    await page.goto('/app/documentos');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});
