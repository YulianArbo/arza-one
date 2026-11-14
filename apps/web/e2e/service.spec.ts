import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Mesa de ayuda (B28): bandeja, ficha del tiquete con la conversación y las compensaciones,
// registro, acuerdos de tiempo y garantías, sin violaciones de accesibilidad WCAG 2.2 AA en modo
// claro y oscuro. Datos ficticios.

const TICKET = '01999a00-0000-7000-8000-0000000f8001';
const ORG = '01999a00-0000-7000-8000-00000000f001';
const AGENT = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };
const PROJECT = {
  id: '01999a00-0000-7000-8000-0000000e0001',
  code: 'PRY-2026-0001',
  name: 'Portal',
};
const DELIVERABLE = { id: '01999a00-0000-7000-8000-0000000e0901', name: 'Portal de autogestión' };

const SUMMARY = {
  id: TICKET,
  code: 'TIQ-2026-0001',
  subject: 'No carga el reporte de ventas',
  status: 'in_progress',
  priority: 'critical',
  level: 1,
  category: 'incident',
  party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
  assignee: AGENT,
  requester: null,
  response_due_at: '2026-11-06T16:00:00.000Z',
  resolution_due_at: '2026-11-06T19:00:00.000Z',
  first_response_at: null,
  clock: 'at_risk',
  in_warranty: true,
  created_at: '2026-11-06T15:00:00.000Z',
};

const DETAIL = {
  ...SUMMARY,
  description: 'Desde esta mañana el reporte queda en blanco.',
  channel: 'phone',
  requester_name: 'Ana Gómez',
  project: PROJECT,
  deliverable: DELIVERABLE,
  warranty: { id: '01999a00-0000-7000-8000-0000000f8301', ends_on: '2027-02-04' },
  sla: { calendar: 'continuous', first_response_hours: 1, resolution_hours: 4 },
  paused_at: null,
  resolved_at: null,
  resolution: null,
  auto_close_at: null,
  closed_at: null,
  created_by: AGENT,
  version: 3,
  can: {
    update: true,
    assign: true,
    work: true,
    reopen: false,
    close: false,
    write_internal: true,
    write_public: true,
    propose_compensation: true,
    decide_compensation: true,
  },
};

const MESSAGES = {
  data: [
    {
      id: '01999a00-0000-7000-8000-0000000f8401',
      author: AGENT,
      body: 'Revisar los registros del servidor.',
      is_internal: true,
      from_client: false,
      created_at: '2026-11-06T15:05:00.000Z',
    },
  ],
};

const COMPENSATIONS = {
  data: [
    {
      id: '01999a00-0000-7000-8000-0000000f8101',
      ticket: { id: TICKET, code: 'TIQ-2026-0001' },
      type: 'discount',
      amount: '150000.00',
      hours: null,
      days: null,
      reason: 'Se superó el plazo de solución.',
      status: 'proposed',
      proposed_by: AGENT,
      decided_by: null,
      decided_at: null,
      decision_note: null,
      applied_on: null,
      created_at: '2026-11-06T15:20:00.000Z',
      version: 1,
    },
  ],
};

const POLICIES = {
  data: [
    { priority: 'critical', first: 1, resolution: 4, calendar: 'continuous' },
    { priority: 'high', first: 4, resolution: 16, calendar: 'business' },
    { priority: 'medium', first: 8, resolution: 40, calendar: 'business' },
    { priority: 'low', first: 16, resolution: 80, calendar: 'business' },
  ].map((row, index) => ({
    id: `01999a00-0000-7000-8000-0000000f820${String(index + 1)}`,
    priority: row.priority,
    first_response_hours: row.first,
    resolution_hours: row.resolution,
    calendar: row.calendar,
    version: 1,
  })),
  can_manage: true,
};

const WARRANTIES = {
  data: [
    {
      id: '01999a00-0000-7000-8000-0000000f8301',
      project: PROJECT,
      deliverable: DELIVERABLE,
      party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
      starts_on: '2026-11-06',
      ends_on: '2027-02-04',
      scope: 'Corrección de fallas del entregable.',
      active: true,
      version: 1,
    },
  ],
  can_manage: true,
};

const API: ApiRoutes = {
  '/v1/tickets': { body: { data: [SUMMARY], next_cursor: null } },
  '/v1/tickets/options': { body: { assignees: [AGENT] } },
  [`/v1/tickets/${TICKET}`]: { body: DETAIL },
  [`/v1/tickets/${TICKET}/messages`]: { body: MESSAGES },
  [`/v1/tickets/${TICKET}/compensations`]: { body: COMPENSATIONS },
  '/v1/sla-policies': { body: POLICIES },
  '/v1/warranties': { body: WARRANTIES },
  '/v1/parties': { body: { data: [], next_cursor: null } },
};

const PAGES = [
  { path: '/app/servicio', ready: 'TIQ-2026-0001', name: 'la bandeja', tab: null },
  {
    path: `/app/servicio/tiquetes/${TICKET}`,
    ready: 'Revisar los registros del servidor.',
    name: 'la conversación',
    tab: null,
  },
  {
    path: `/app/servicio/tiquetes/${TICKET}`,
    ready: 'Datos del tiquete',
    name: 'los datos',
    tab: 'Datos',
  },
  {
    path: `/app/servicio/tiquetes/${TICKET}`,
    ready: 'Por aprobar',
    name: 'las compensaciones',
    tab: 'Compensaciones',
  },
  {
    path: '/app/servicio/tiquetes/nuevo',
    ready: 'Registrar el tiquete',
    name: 'el registro',
    tab: null,
  },
  {
    path: '/app/servicio/acuerdos',
    ready: 'Corrido, 24 horas al día',
    name: 'los acuerdos',
    tab: null,
  },
  {
    path: '/app/servicio/garantias',
    ready: 'Vigente',
    name: 'las garantías',
    tab: null,
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Mesa de ayuda en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que Proyectos: equipo con poca memoria y servidor recién encendido.
    test.slow();
    for (const page of PAGES) {
      test(`${page.name} no tiene violaciones de accesibilidad`, async ({
        page: browser,
        consoleErrors,
      }) => {
        await useTheme(browser, theme);
        await mockApi(browser, API);
        await browser.goto(page.path);
        if (page.tab !== null) await browser.getByRole('tab', { name: page.tab }).click();
        await expect(browser.getByText(page.ready, { exact: true }).first()).toBeVisible();
        expect(await accessibilityViolations(browser)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}
