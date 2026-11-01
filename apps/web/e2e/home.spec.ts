import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Tablero de Inicio con datos (B22A). Datos ficticios: ninguno es real.

const PERSON = {
  id: '01999a00-0000-7000-8000-00000000a001',
  email: 'ana@demo-uno.test',
  display_name: 'Ana Pérez',
};
const STATE = { key: 'draft', label: 'Borrador', kind: 'initial' };

function task(index: number, workflow: string) {
  return {
    id: `01999a00-0000-7000-8000-0000000e000${String(index)}`,
    title: `Revisar solicitud ${String(index)}`,
    kind: 'action',
    status: 'pending',
    priority: index === 1 ? 'high' : 'normal',
    due_at: '2026-10-30T21:00:00.000Z',
    assignee: PERSON,
    assignee_role: null,
    escalated_to: null,
    escalated_at: null,
    delegated_from: null,
    instance: {
      id: `01999a00-0000-7000-8000-0000000e010${String(index)}`,
      title: `Solicitud ${String(index)}`,
      workflow_name: workflow,
      state: STATE,
    },
    reason: 'assigned',
    created_at: '2026-10-20T14:00:00.000Z',
    completed_at: null,
  };
}

function stage(key: string, label: string, value: string) {
  return { stage: key, label, count: 1, value, weighted_value: '0.00' };
}

function row(code: string, created_on: string, status: string, closed_on: string | null) {
  return {
    code,
    created_on,
    client: 'Cliente de prueba S.A.S.',
    title: 'Proyecto de prueba',
    stage: status === 'open' ? 'proposal' : status,
    estimated_value: '10000000.00',
    probability: 50,
    weighted_value: '5000000.00',
    expected_close: '2026-12-15',
    owner: 'Ana Pérez',
    status,
    lost_reason: null,
    closed_on,
  };
}

const FUNNEL = {
  generated_at: '2026-10-24T15:00:00.000Z',
  stages: [
    stage('prospecting', 'Prospección', '40000000.00'),
    stage('diagnosis', 'Diagnóstico', '25000000.00'),
    stage('proposal', 'Propuesta', '18000000.00'),
    stage('negotiation', 'Negociación', '9000000.00'),
    stage('won', 'Ganada', '12000000.00'),
    stage('lost', 'Perdida', '3000000.00'),
  ],
  totals: {
    open_count: 4,
    open_value: '92000000.00',
    weighted_value: '31000000.00',
    won_count: 1,
    won_value: '12000000.00',
    lost_count: 1,
    lost_value: '3000000.00',
    win_rate: 50,
    leads_count: 6,
    converted_leads: 3,
    lead_conversion_rate: 50,
  },
  lost_reasons: [],
  rows: [
    row('OPO-2026-0001', '2026-08-05', 'won', '2026-10-02'),
    row('OPO-2026-0002', '2026-09-12', 'open', null),
    row('OPO-2026-0003', '2026-10-01', 'open', null),
    row('OPO-2026-0004', '2026-10-15', 'lost', '2026-10-20'),
  ],
};

const HOME_API: ApiRoutes = {
  '/v1/tasks/mine': {
    body: { data: [task(1, 'Compras'), task(2, 'Compras'), task(3, 'Viajes')], next_cursor: null },
  },
  '/v1/crm/reports/funnel': { body: FUNNEL },
};

for (const theme of ['light', 'dark'] as const) {
  test(`el tablero de Inicio con datos no tiene violaciones en modo ${theme}`, async ({ page }) => {
    await useTheme(page, theme);
    await mockApi(page, HOME_API);
    await page.goto('/app');
    await expect(page.getByRole('link', { name: 'Revisar solicitud 1' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Embudo abierto', exact: true })).toBeVisible();
    expect(await accessibilityViolations(page)).toEqual([]);
  });
}

test.describe('tablero de Inicio en celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('no se desborda', async ({ page }) => {
    await mockApi(page, HOME_API);
    await page.goto('/app');
    await expect(page.getByRole('link', { name: 'Revisar solicitud 1' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
