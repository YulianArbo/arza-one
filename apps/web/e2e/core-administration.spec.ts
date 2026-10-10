import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de datos maestros de B12: accesibilidad WCAG 2.2 AA en modo claro y oscuro, y quien
// solo lee no ve los botones para cambiar.

const DG = '01999a00-0000-7000-8000-00000000e101';
const DIRECTOR = '01999a00-0000-7000-8000-00000000e201';
const SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '13:00', end: '17:00' },
};
const VERSION = {
  id: '01999a00-0000-7000-8000-00000000e701',
  value: SCHEDULE,
  valid_from: '2026-01-01',
  valid_to: null,
  created_at: '2026-10-09T20:15:00Z',
  created_by: null,
};
const CATALOG = {
  key: 'identification_types',
  name: 'Tipos de documento de identidad',
  description: 'Documentos con que se identifica una persona.',
  item_count: 1,
};

const CORE_API: ApiRoutes = {
  '/v1/tenant': {
    body: {
      id: DG,
      legal_name: 'Empresa Demo S.A.S.',
      trade_name: null,
      tax_id: '900123456-7',
      version: 1,
    },
  },
  '/v1/sites': {
    body: {
      data: [
        {
          id: DG,
          name: 'Sede norte',
          city: 'Bogotá',
          address: 'Calle 100 # 10-20',
          is_main: true,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
  '/v1/org-units': {
    body: {
      data: [
        {
          id: DG,
          parent_id: null,
          code: 'DG',
          name: 'Dirección General',
          kind: 'process',
          owner_position_id: DIRECTOR,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
  '/v1/positions': {
    body: {
      data: [
        {
          id: DIRECTOR,
          org_unit_id: DG,
          name: 'Director General',
          reports_to_id: null,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
  '/v1/cost-centers': { body: { data: [] } },
  '/v1/catalogs': { body: { data: [CATALOG] } },
  '/v1/catalogs/identification_types': {
    body: {
      ...CATALOG,
      items: [
        {
          id: DIRECTOR,
          code: 'CC',
          label: 'Cédula de ciudadanía',
          sort_order: 10,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
  '/v1/parameters': {
    body: {
      data: [
        {
          key: 'work.schedule',
          label: 'Horario laboral',
          description: 'Días y horas.',
          current: VERSION,
          scheduled: null,
        },
      ],
    },
  },
  '/v1/parameters/work.schedule/history': {
    body: { key: 'work.schedule', label: 'Horario laboral', data: [VERSION] },
  },
  '/v1/sequences': { body: { data: [] } },
  '/v1/holidays': {
    body: { data: [{ id: DIRECTOR, date: '2026-07-20', name: 'Día de la Independencia' }] },
  },
};

const PAGES = [
  { path: '/app/administracion', ready: 'Festivos y días hábiles' },
  { path: '/app/administracion/empresa', ready: 'Sede norte' },
  { path: '/app/administracion/procesos-y-cargos', ready: 'es provisional' },
  { path: '/app/administracion/centros-de-costo', ready: 'Todavía no hay centros de costo' },
  { path: '/app/administracion/catalogos', ready: 'Cédula de ciudadanía' },
  { path: '/app/administracion/parametros', ready: 'Sigue vigente' },
  { path: '/app/administracion/consecutivos', ready: 'Todavía no hay consecutivos' },
  { path: '/app/administracion/festivos', ready: 'Día de la Independencia' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`datos maestros en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, CORE_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('quien solo consulta los datos maestros', () => {
  const READER = {
    roles: [{ id: DIRECTOR, code: 'COLABORADOR', name: 'Colaborador' }],
    permissions: ['core.tenant.read', 'core.org.read', 'core.parameter.read'].map((code) => ({
      code,
      scope: 'all',
    })),
  };

  test('ve el organigrama pero no los botones para cambiarlo', async ({ page }) => {
    await mockPermissions(page, READER);
    await mockApi(page, CORE_API);
    await page.goto('/app/administracion/procesos-y-cargos');
    await expect(page.getByText('Director General').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar un cargo' })).toBeHidden();
  });

  test('si escribe la dirección de los consecutivos, ve «Sin permiso»', async ({ page }) => {
    await mockPermissions(page, READER);
    await mockApi(page, CORE_API);
    await page.goto('/app/administracion/consecutivos');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});
