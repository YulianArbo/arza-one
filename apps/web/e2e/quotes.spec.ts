import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Cotizaciones y portafolio (B23): lista, ficha, asistente, portafolio, parámetros tributarios y la
// página del cliente, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro; la del
// cliente también en un celular de 390 px. Datos ficticios.

const QUOTE = '01999a00-0000-7000-8000-0000000c0501';
const OPPORTUNITY = '01999a00-0000-7000-8000-0000000c0101';
const ORG = '01999a00-0000-7000-8000-00000000f001';
const SERVICE = '01999a00-0000-7000-8000-0000000c0601';
const OWNER = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };
const TOKEN = 'A'.repeat(43);

const ITEM = {
  position: 1,
  description: 'Desarrollo a la medida',
  unit: 'hour',
  quantity: '10.00',
  unit_price: '85000.00',
  discount_percent: '5.00',
  tax_rate: '19.00',
  line_total: '960925.00',
};

const TOTALS = {
  subtotal: '850000.00',
  discount_total: '42500.00',
  tax_total: '153425.00',
  total: '960925.00',
  taxes: [{ tax_rate: '19.00', base: '807500.00', tax: '153425.00' }],
};

const CONDITIONS = {
  payment_terms: '50 % al iniciar y 50 % a la entrega',
  delivery_terms: 'Treinta días calendario',
  warranty: null,
};

const SUMMARY = {
  id: QUOTE,
  code: 'COT-2026-0001',
  version_number: 1,
  opportunity: { id: OPPORTUNITY, code: 'OPO-2026-0001', title: 'Portal de clientes' },
  party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
  status: 'approved',
  valid_until: '2026-11-30',
  total: '960925.00',
  author: OWNER,
  sent_at: null,
  created_at: '2026-10-28T15:00:00.000Z',
  version: 3,
};

const DETAIL = {
  ...SUMMARY,
  ...TOTALS,
  conditions: CONDITIONS,
  notes: null,
  items: [
    {
      ...ITEM,
      id: '01999a00-0000-7000-8000-0000000c0701',
      service: { id: SERVICE, code: 'SRV-0001' },
      tax_key: 'IVA_GENERAL',
      line_subtotal: '850000.00',
      line_discount: '42500.00',
      line_tax: '153425.00',
    },
  ],
  approval: {
    required: false,
    largest_discount: '5.00',
    discount_cap: '10.00',
    decided_by: null,
    decided_at: null,
    note: null,
  },
  recipient: null,
  email_sent_at: null,
  response: null,
  pdf: { status: 'ready', file_name: 'COT-2026-0001-v1.pdf' },
  party_email: 'compras@andina.example',
  versions: [
    {
      id: QUOTE,
      version_number: 1,
      status: 'approved',
      total: '960925.00',
      created_at: '2026-10-28T15:00:00.000Z',
    },
  ],
};

const SERVICE_ROW = {
  id: SERVICE,
  code: 'SRV-0001',
  name: 'Desarrollo a la medida',
  description: 'Horas del equipo de desarrollo',
  unit: 'hour',
  base_price: '85000.00',
  tax_key: 'IVA_GENERAL',
  tax_label: 'IVA general',
  is_active: true,
  version: 1,
};

const TAX_VERSION = {
  id: '01999a00-0000-7000-8000-0000000e0001',
  rate: '19.00',
  valid_from: '2026-01-01',
  valid_to: null,
  legal_basis: 'Estatuto Tributario, art. 468. Por validar por el Contador.',
  created_at: '2026-01-01T05:00:00.000Z',
  created_by: null,
};

const API: ApiRoutes = {
  '/v1/crm/quotes': { body: { data: [SUMMARY], next_cursor: null } },
  [`/v1/crm/quotes/${QUOTE}`]: { body: DETAIL },
  '/v1/crm/quotes/options': {
    body: {
      services: [SERVICE_ROW],
      taxes: [{ key: 'IVA_GENERAL', label: 'IVA general', rate: '19.00' }],
      discount_cap: '10.00',
      default_valid_days: 30,
    },
  },
  '/v1/crm/services': { body: { data: [SERVICE_ROW] } },
  [`/v1/crm/opportunities/${OPPORTUNITY}`]: {
    body: {
      id: OPPORTUNITY,
      code: 'OPO-2026-0001',
      title: 'Portal de clientes',
      party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
      stage: 'proposal',
      estimated_value: '25000000.00',
      probability: 50,
      weighted_value: '12500000.00',
      expected_close: '2026-12-15',
      owner: OWNER,
      lost_reason: null,
      closed_at: null,
      version: 3,
      lead: null,
      lost_note: null,
      created_at: '2026-10-21T15:00:00.000Z',
    },
  },
  '/v1/finance/tax-parameters': {
    body: {
      data: [{ key: 'IVA_GENERAL', label: 'IVA general', current: TAX_VERSION, scheduled: null }],
    },
  },
  '/v1/finance/tax-parameters/IVA_GENERAL/history': {
    body: { key: 'IVA_GENERAL', label: 'IVA general', data: [TAX_VERSION] },
  },
  '/v1/public/quotes/view': {
    body: {
      company: { name: 'ARZA TECH S.A.S.', tax_id: '900000000-1' },
      code: 'COT-2026-0001',
      version_number: 1,
      party_name: 'Comercializadora Andina S.A.S.',
      issued_at: '2026-10-28T15:00:00.000Z',
      valid_until: '2099-11-30',
      state: 'open',
      conditions: CONDITIONS,
      notes: null,
      items: [ITEM],
      ...TOTALS,
      responded_at: null,
      responded_by: null,
    },
  },
};

const PAGES = [
  { path: '/app/comercial/cotizaciones', ready: 'COT-2026-0001 · v1', name: 'las cotizaciones' },
  { path: `/app/comercial/cotizaciones/${QUOTE}`, ready: 'Enviar al cliente', name: 'la ficha' },
  {
    path: `/app/comercial/cotizaciones/nueva?oportunidad=${OPPORTUNITY}`,
    ready: '1. Cliente y vigencia',
    name: 'el asistente',
  },
  { path: '/app/comercial/portafolio', ready: 'SRV-0001', name: 'el portafolio' },
  {
    path: '/app/finanzas/parametros-tributarios',
    ready: 'Registrar una tarifa',
    name: 'los parámetros tributarios',
  },
  { path: `/cotizacion#token=${TOKEN}`, ready: 'Aceptar la cotización', name: 'la del cliente' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Cotizaciones en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
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

test.describe('la cotización del cliente en el celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.slow();

  test('se lee sin desplazarse a los lados y no tiene violaciones', async ({ page }) => {
    await mockApi(page, API);
    await page.goto(`/cotizacion#token=${TOKEN}`);
    await expect(page.getByRole('button', { name: 'Aceptar la cotización' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    expect(page.url()).not.toContain(TOKEN);
    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
