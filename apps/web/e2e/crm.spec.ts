import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Comercial, CRM (B22): embudo, prospectos, ficha del prospecto, ficha de la oportunidad,
// actividades, campañas e informe del embudo, sin violaciones de accesibilidad WCAG 2.2 AA en modo
// claro y oscuro. Datos ficticios.

const LEAD = '01999a00-0000-7000-8000-0000000c0001';
const OPPORTUNITY = '01999a00-0000-7000-8000-0000000c0101';
const PERSON = '01999a00-0000-7000-8000-00000000f002';
const ORG = '01999a00-0000-7000-8000-00000000f001';
const OWNER = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };

const LEAD_SUMMARY = {
  id: LEAD,
  code: 'LEA-2026-0001',
  status: 'new',
  person: { id: PERSON, name: 'Laura Gómez Ríos' },
  email: 'laura@andina.example',
  phone: null,
  company_name: 'Andina S.A.S.',
  source: { code: 'WEBSITE', label: 'Sitio web' },
  campaign: null,
  owner: OWNER,
  created_at: '2026-10-20T15:00:00.000Z',
  version: 2,
};

const OPPORTUNITY_SUMMARY = {
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
};

const ACTIVITY = {
  id: '01999a00-0000-7000-8000-0000000c0201',
  type: 'meeting',
  subject: 'Reunión de diagnóstico',
  notes: null,
  due_at: '2026-10-23T15:00:00.000Z',
  done_at: null,
  outcome: null,
  assignee: OWNER,
  record: {
    kind: 'opportunity',
    id: OPPORTUNITY,
    code: 'OPO-2026-0001',
    label: 'Portal de clientes',
  },
  version: 1,
};

const STAGE = (stage: string, label: string, count: number) => ({
  stage,
  label,
  count,
  value: count === 0 ? '0.00' : '25000000.00',
  weighted_value: count === 0 ? '0.00' : '12500000.00',
});

const FUNNEL = {
  generated_at: '2026-10-22T15:00:00.000Z',
  stages: [
    STAGE('prospecting', 'Prospección', 0),
    STAGE('diagnosis', 'Diagnóstico', 0),
    STAGE('proposal', 'Propuesta', 1),
    STAGE('negotiation', 'Negociación', 0),
    STAGE('won', 'Ganada', 0),
    STAGE('lost', 'Perdida', 0),
  ],
  totals: {
    open_count: 1,
    open_value: '25000000.00',
    weighted_value: '12500000.00',
    won_count: 0,
    won_value: '0.00',
    lost_count: 0,
    lost_value: '0.00',
    win_rate: null,
    leads_count: 1,
    converted_leads: 0,
    lead_conversion_rate: 0,
  },
  lost_reasons: [],
  rows: [
    {
      code: 'OPO-2026-0001',
      created_on: '2026-10-21',
      client: 'Comercializadora Andina S.A.S.',
      title: 'Portal de clientes',
      stage: 'proposal',
      estimated_value: '25000000.00',
      probability: 50,
      weighted_value: '12500000.00',
      expected_close: '2026-12-15',
      owner: 'Ana Pérez',
      status: 'open',
      lost_reason: null,
      closed_on: null,
    },
  ],
};

const CATALOG = {
  key: 'crm_lead_sources',
  name: 'Orígenes de los prospectos',
  description: null,
  item_count: 1,
  items: [
    {
      id: '01999a00-0000-7000-8000-0000000c0501',
      code: 'WEBSITE',
      label: 'Sitio web',
      sort_order: 0,
      is_active: true,
      version: 1,
    },
  ],
};

const API: ApiRoutes = {
  '/v1/crm/opportunities': { body: { data: [OPPORTUNITY_SUMMARY], next_cursor: null } },
  [`/v1/crm/opportunities/${OPPORTUNITY}`]: {
    body: {
      ...OPPORTUNITY_SUMMARY,
      lead: null,
      lost_note: null,
      created_at: '2026-10-21T15:00:00.000Z',
    },
  },
  '/v1/crm/leads': { body: { data: [LEAD_SUMMARY], next_cursor: null } },
  [`/v1/crm/leads/${LEAD}`]: {
    body: {
      ...LEAD_SUMMARY,
      need: 'Necesita un portal de autogestión para sus clientes.',
      consent: {
        id: '01999a00-0000-7000-8000-0000000c0401',
        granted_on: '2026-10-20',
        purposes: ['COMMERCIAL'],
      },
      discard_reason: null,
      discard_note: null,
      opportunity: null,
      qualified_at: null,
      closed_at: null,
    },
  },
  '/v1/crm/activities': { body: { data: [ACTIVITY], next_cursor: null } },
  '/v1/crm/campaigns': {
    body: {
      data: [
        {
          id: '01999a00-0000-7000-8000-0000000c0301',
          name: 'Feria tecnológica',
          channel: 'event',
          starts_on: '2026-10-01',
          ends_on: null,
          budget: '1500000.00',
          leads_count: 4,
          version: 1,
        },
      ],
    },
  },
  '/v1/crm/reports/funnel': { body: FUNNEL },
  '/v1/catalogs/crm_lead_sources': { body: CATALOG },
};

const PAGES = [
  { path: '/app/comercial', ready: 'Portal de clientes', name: 'el tablero del embudo' },
  { path: '/app/comercial/prospectos', ready: 'Laura Gómez Ríos', name: 'los prospectos' },
  { path: `/app/comercial/prospectos/${LEAD}`, ready: 'Calificar', name: 'la ficha del prospecto' },
  {
    path: `/app/comercial/oportunidades/${OPPORTUNITY}`,
    ready: 'Marcar ganada',
    name: 'la ficha de la oportunidad',
  },
  { path: '/app/comercial/actividades', ready: 'Reunión de diagnóstico', name: 'la agenda' },
  { path: '/app/comercial/campanas', ready: 'Feria tecnológica', name: 'las campañas' },
  { path: '/app/comercial/informe', ready: 'Por etapa', name: 'el informe del embudo' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Comercial en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
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
