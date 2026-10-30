import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Contratos (B24): lista, ficha con el texto y sus cláusulas modificadas, asistente, edición del
// borrador y biblioteca de cláusulas, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y
// oscuro. Datos ficticios.

const CONTRACT = '01999a00-0000-7000-8000-0000000d0001';
const TEMPLATE = '01999a00-0000-7000-8000-0000000d0101';
const ORG = '01999a00-0000-7000-8000-00000000f001';
const OWNER = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };

const SUMMARY = {
  id: CONTRACT,
  code: 'CTR-2026-0001',
  kind: 'contract',
  title: 'Portal de clientes',
  party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
  status: 'in_review',
  value: '12000000.00',
  starts_on: '2026-11-01',
  ends_on: '2027-10-31',
  responsible: OWNER,
  has_modified_clauses: true,
  created_at: '2026-10-29T15:00:00.000Z',
  version: 3,
};

const CLAUSES = [
  {
    id: '01999a00-0000-7000-8000-0000000d0201',
    position: 1,
    ordinal: null,
    clause_key: 'partes-contrato',
    clause_version: 1,
    title: 'Partes',
    body: 'Entre ARZA TECH S.A.S. y Comercializadora Andina S.A.S.',
    origin: 'library',
    library_text: null,
    required: true,
  },
  {
    id: '01999a00-0000-7000-8000-0000000d0202',
    position: 2,
    ordinal: 'PRIMERA',
    clause_key: 'garantia',
    clause_version: 1,
    title: 'Garantía',
    body: 'Seis meses de garantía.',
    origin: 'modified',
    library_text: 'Tres meses de garantía.',
    required: false,
  },
];

const DETAIL = {
  ...SUMMARY,
  object: 'desarrollar el portal de autogestión de los clientes',
  payment_terms: '50 % al iniciar y 50 % a la entrega',
  renewal: 'by_agreement',
  client_signer_name: 'Laura Gómez',
  client_signer_document: 'CC 43000000',
  template: { id: TEMPLATE, code: 'CT-COM-001', name: 'Contrato de desarrollo de software' },
  quote: null,
  author: OWNER,
  clauses: CLAUSES,
  approval: {
    submitted_at: '2026-10-29T16:00:00.000Z',
    decided_by: null,
    decided_at: null,
    note: null,
    legal_note: null,
  },
  pdf: { status: 'none', file_name: null, sha256: null },
  signed: null,
  termination: null,
  last_alert_days: null,
  obligations: [],
  amendments: [],
};

const TEMPLATES = [
  {
    id: TEMPLATE,
    code: 'CT-COM-001',
    name: 'Contrato de desarrollo de software',
    kind: 'contract',
    version: '01',
    clauses: [{ key: 'partes-contrato', title: 'Partes', required: true }],
  },
];

const API: ApiRoutes = {
  '/v1/contracts': { body: { data: [SUMMARY], next_cursor: null } },
  [`/v1/contracts/${CONTRACT}`]: { body: DETAIL },
  '/v1/contracts/options': { body: { templates: TEMPLATES, signers: [], quote: null } },
  '/v1/contract-clauses': {
    body: {
      data: [
        {
          key: 'garantia',
          version: 1,
          title: 'Garantía',
          body: 'Tres meses de garantía.',
          numbered: true,
          legal_validated: false,
          approved_by: null,
          approved_at: '2026-10-29T05:00:00.000Z',
          templates: ['CT-COM-001'],
        },
      ],
    },
  },
  '/v1/parties': { body: { data: [], next_cursor: null } },
  '/v1/files': { body: { data: [] } },
};

const PAGES = [
  { path: '/app/contratos', ready: 'CTR-2026-0001', name: 'la lista' },
  { path: `/app/contratos/${CONTRACT}`, ready: 'Aprobar', name: 'la ficha' },
  { path: '/app/contratos/nuevo', ready: '1. Plantilla y cliente', name: 'el asistente' },
  {
    path: '/app/contratos/clausulas',
    ready: 'Por validar por el asesor jurídico',
    name: 'la biblioteca',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Contratos en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que Comercial (B22): equipo con poca memoria y servidor recién encendido.
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

test.describe('ficha del contrato', () => {
  test.slow();

  test('el texto marca la cláusula modificada y la compara con la biblioteca', async ({ page }) => {
    await mockApi(page, API);
    await page.goto(`/app/contratos/${CONTRACT}`);
    const tab = page.getByRole('tab', { name: 'Texto' });
    await tab.click();
    const text = page.getByRole('list', { name: 'Texto del contrato' });
    await expect(text.getByText('Modificada', { exact: true })).toBeVisible();
    await text.getByText('Ver el texto de la biblioteca').click();
    await expect(text.getByText('Tres meses de garantía.')).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
