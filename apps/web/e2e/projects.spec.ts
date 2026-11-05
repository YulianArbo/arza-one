import { mockApi, type ApiRoutes } from './support/api-mock';
import { E2E_API_URL } from './support/environment';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Proyectos (B26): lista, asistente, ficha y tablero de trabajo con arrastrar y soltar y con el
// teclado («Mover a»), sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro. Datos
// ficticios.

const PROJECT = '01999a00-0000-7000-8000-0000000e0001';
const SPRINT = '01999a00-0000-7000-8000-0000000e0101';
const ITEM = '01999a00-0000-7000-8000-0000000e0201';
const ORG = '01999a00-0000-7000-8000-00000000f001';
const LEADER = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };

const SUMMARY = {
  id: PROJECT,
  code: 'PRY-2026-0001',
  name: 'Portal de clientes',
  party: { id: ORG, name: 'Comercializadora Andina S.A.S.' },
  contract: null,
  status: 'in_progress',
  starts_on: '2026-11-01',
  ends_on: '2027-02-28',
  manager: LEADER,
  progress: { planned: 2, done: 1, percent: 50 },
  version: 3,
};

const SPRINT_VIEW = {
  id: SPRINT,
  name: 'Iteración 1',
  starts_on: '2026-11-02',
  ends_on: '2026-11-15',
  goal: null,
  status: 'active',
  items: 2,
  version: 2,
};

const DETAIL = {
  ...SUMMARY,
  type: 'development',
  methodology: 'scrum',
  description: null,
  budget_hours: 480,
  budget_amount: '12000000.00',
  status_reason: null,
  contract_status: null,
  authorization: {
    status: 'granted',
    reason: 'Urgente',
    note: null,
    decided_by: null,
    decided_at: null,
  },
  started_at: '2026-11-01T14:00:00.000Z',
  created_at: '2026-10-31T15:00:00.000Z',
  members: [
    {
      id: '01999a00-0000-7000-8000-0000000e0301',
      person: LEADER,
      role: 'leader',
      allocation_pct: 100,
      version: 1,
    },
  ],
  milestones: [],
  sprints: [SPRINT_VIEW],
  links: [],
  can: { update: true, manage_members: true, manage_items: true },
};

function item(overrides: object): object {
  return {
    id: ITEM,
    number: 1,
    code: 'PRY-2026-0001-1',
    type: 'story',
    parent: null,
    title: 'Consultar facturas',
    description: null,
    acceptance_criteria: 'Ve sus facturas del último año.',
    status: 'pending',
    priority: 'normal',
    estimate_hours: null,
    assignee: LEADER,
    sprint_id: SPRINT,
    review_url: null,
    test_note: null,
    done_at: null,
    version: 2,
    ...overrides,
  };
}

const ITEMS = [
  item({}),
  item({
    id: '01999a00-0000-7000-8000-0000000e0202',
    number: 2,
    code: 'PRY-2026-0001-2',
    title: 'Descargar facturas',
    status: 'done',
    review_url: 'https://git.example.com/portal/pull/1',
    test_note: 'Pruebas manuales.',
    done_at: '2026-11-04T15:00:00.000Z',
  }),
];

const API: ApiRoutes = {
  '/v1/projects': { body: { data: [SUMMARY], next_cursor: null } },
  [`/v1/projects/${PROJECT}`]: { body: DETAIL },
  '/v1/projects/options': { body: { contracts: [], people: [LEADER] } },
  [`/v1/projects/${PROJECT}/items`]: { body: { data: ITEMS } },
  [`/v1/projects/${PROJECT}/board`]: {
    body: { sprint: SPRINT_VIEW, items: ITEMS, refreshed_at: '2026-11-05T15:00:00.000Z' },
  },
  [`/v1/projects/${PROJECT}/items/${ITEM}/actions/move`]: { status: 204, body: null },
  '/v1/parties': { body: { data: [], next_cursor: null } },
};

const PAGES = [
  { path: '/app/proyectos', ready: 'PRY-2026-0001', name: 'la lista', tab: null },
  { path: `/app/proyectos/${PROJECT}`, ready: 'Datos del proyecto', name: 'la ficha', tab: null },
  {
    path: `/app/proyectos/${PROJECT}`,
    ready: '#1 Consultar facturas',
    name: 'el tablero',
    tab: 'Tablero',
  },
  {
    path: '/app/proyectos/nuevo',
    ready: '1. Origen del proyecto',
    name: 'el asistente',
    tab: null,
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Proyectos en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que Contratos (B24): equipo con poca memoria y servidor recién encendido.
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

const MOVE_URL = `${E2E_API_URL}/v1/projects/${PROJECT}/items/${ITEM}/actions/move`;

test.describe('tablero de trabajo', () => {
  test.slow();

  test('una tarjeta se arrastra a la columna siguiente', async ({ page }) => {
    await mockApi(page, API);
    await page.goto(`/app/proyectos/${PROJECT}`);
    await page.getByRole('tab', { name: 'Tablero' }).click();
    const card = page.getByRole('listitem').filter({ hasText: '#1 Consultar facturas' });
    const target = page.getByRole('region', { name: /En curso/u });
    const moved = page.waitForRequest((request) => request.url() === MOVE_URL);
    await card.dragTo(target);
    expect((await moved).postDataJSON()).toMatchObject({ status: 'in_progress' });
  });

  test('con el teclado, «Mover a» lleva la tarjeta a otra columna', async ({ page }) => {
    await mockApi(page, API);
    await page.goto(`/app/proyectos/${PROJECT}`);
    await page.getByRole('tab', { name: 'Tablero' }).click();
    await page.getByRole('button', { name: 'Mover #1 Consultar facturas a otra columna' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'En curso' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'En revisión' })).toHaveCount(0);
    const moved = page.waitForRequest((request) => request.url() === MOVE_URL);
    await page.getByRole('menuitem', { name: 'En curso' }).focus();
    await page.keyboard.press('Enter');
    expect((await moved).postDataJSON()).toMatchObject({ status: 'in_progress' });
  });
});
