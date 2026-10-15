import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas del motor de flujos de B15: «Mis tareas», una tarea con su historial y el editor de
// flujos, con accesibilidad WCAG 2.2 AA en modo claro y oscuro, y quien no tiene permiso.

const TASK_ID = '01999a00-0000-7000-8000-0000000e0001';
const INSTANCE_ID = '01999a00-0000-7000-8000-0000000e0002';
const DEFINITION_ID = '01999a00-0000-7000-8000-0000000e0003';
const ANA = {
  id: '01999a00-0000-7000-8000-00000000a001',
  email: 'ana@demo-uno.test',
  display_name: 'Ana Pérez',
};
const DRAFT = { key: 'draft', label: 'Borrador', kind: 'initial' };
const REVIEW = { key: 'review', label: 'Revisión', kind: 'approval' };

const TASK = {
  id: TASK_ID,
  title: 'Borrador: Compra de portátiles',
  kind: 'action',
  status: 'overdue',
  priority: 'urgent',
  due_at: '2026-10-16T21:00:00.000Z',
  assignee: ANA,
  assignee_role: null,
  escalated_to: null,
  escalated_at: null,
  delegated_from: null,
  instance: {
    id: INSTANCE_ID,
    title: 'Compra de portátiles',
    workflow_name: 'Solicitud de prueba',
    state: DRAFT,
  },
  reason: 'assigned',
  created_at: '2026-10-15T14:00:00.000Z',
  completed_at: null,
};

const HISTORY = [
  {
    id: '01999a00-0000-7000-8000-0000000e0101',
    from_state: null,
    to_state: DRAFT,
    action: 'start',
    action_label: 'Inició el trámite',
    actor: ANA,
    on_behalf_of: null,
    comment: null,
    occurred_at: '2026-10-15T14:00:00.000Z',
  },
];

const DEFINITION = {
  id: DEFINITION_ID,
  key: 'demo.request',
  name: 'Solicitud de prueba',
  entity_type: 'demo.request',
  version: 1,
  status: 'draft',
  published_at: null,
  updated_at: '2026-10-15T14:00:00.000Z',
  description: null,
  row_version: 2,
  problems: [],
  states: [
    { ...DRAFT, sla_hours: 8, priority: 'normal', assignee: { type: 'initiator' }, approval: null },
    {
      ...REVIEW,
      sla_hours: 16,
      priority: 'high',
      assignee: null,
      approval: { mode: 'serial', approvers: [{ type: 'supervisor' }] },
    },
    {
      key: 'done',
      label: 'Aprobada',
      kind: 'final',
      sla_hours: null,
      priority: 'normal',
      assignee: null,
      approval: null,
    },
  ],
  transitions: [
    {
      from_state: 'draft',
      to_state: 'review',
      action: 'submit',
      label: 'Enviar',
      required_permission: null,
      condition: null,
      requires_comment: false,
    },
    {
      from_state: 'review',
      to_state: 'done',
      action: 'approve',
      label: 'Aprobar',
      required_permission: null,
      condition: null,
      requires_comment: false,
    },
    {
      from_state: 'review',
      to_state: 'draft',
      action: 'reject',
      label: 'Devolver',
      required_permission: null,
      condition: null,
      requires_comment: true,
    },
  ],
};

const WF_API: ApiRoutes = {
  '/v1/tasks/mine': { body: { data: [TASK], next_cursor: null } },
  [`/v1/tasks/${TASK_ID}`]: {
    body: {
      ...TASK,
      can_act: true,
      actions: [
        {
          action: 'submit',
          label: 'Enviar',
          to_state: REVIEW,
          requires_comment: false,
          condition_met: true,
        },
      ],
      history: HISTORY,
    },
  },
  [`/v1/workflows/${DEFINITION_ID}`]: { body: DEFINITION },
  '/v1/roles': { body: { data: [] } },
};

const PAGES = [
  { path: '/app/mis-tareas', ready: 'Borrador: Compra de portátiles' },
  { path: `/app/mis-tareas/${TASK_ID}`, ready: 'Historial del flujo' },
  { path: `/app/administracion/flujos/${DEFINITION_ID}`, ready: 'Transiciones' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`flujos y tareas en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que terceros y archivos: equipo con poca memoria y servidor recién encendido.
    test.slow();
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, WF_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('quien no atiende tareas', () => {
  test('no ve «Mis tareas» en el menú y ve «Sin permiso» si escribe la dirección', async ({
    page,
  }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, WF_API);
    await page.goto('/app/mis-tareas');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Mis tareas' })).toHaveCount(0);
  });
});
