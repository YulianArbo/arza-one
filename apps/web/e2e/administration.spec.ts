import { NO_PERMISSIONS, mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de administración de B10: el menú y las pantallas muestran solo lo permitido, «Sin
// permiso» al entrar por la dirección, y accesibilidad WCAG 2.2 AA en modo claro y oscuro.

const LUIS = '01999a00-0000-7000-8000-00000000a002';
const ROLE = '01999a00-0000-7000-8000-00000000c001';

const USER = {
  id: LUIS,
  email: 'luis@demo-uno.test',
  display_name: 'Luis Gómez',
  kind: 'internal',
  status: 'active',
  last_login_at: '2026-10-09T14:00:00.000Z',
  roles: [{ code: 'COMERCIAL', name: 'Comercial', valid_until: null }],
};
const ROLE_SUMMARY = {
  id: ROLE,
  code: 'COMERCIAL',
  name: 'Comercial',
  description: 'Gerente y analistas comerciales.',
  is_system: true,
  audience: 'internal',
  permission_count: 1,
  assigned_users: 1,
  version: 1,
};
const CATALOG = {
  groups: [
    {
      key: 'crm',
      label: 'Comercial',
      module: 'M05',
      permissions: [{ code: 'crm.lead.read', description: 'Ver prospectos', ownable: false }],
    },
  ],
};

const ADMIN_API: ApiRoutes = {
  '/v1/users': { body: { data: [USER], next_cursor: null } },
  [`/v1/users/${LUIS}`]: {
    body: {
      ...USER,
      created_at: '2026-10-01T14:00:00.000Z',
      assignments: [],
      security: { second_factor: true, mfa_required: true, active_sessions: 1, locked_until: null },
    },
  },
  '/v1/roles': { body: { data: [ROLE_SUMMARY] } },
  [`/v1/roles/${ROLE}`]: {
    body: { ...ROLE_SUMMARY, permissions: [{ code: 'crm.lead.read', scope: 'all' }] },
  },
  '/v1/permissions': { body: CATALOG },
  '/v1/delegations': { body: { data: [] } },
  '/v1/access-review': {
    body: {
      generated_at: '2026-10-09T15:00:00.000Z',
      unused_days: 60,
      totals: { users: 1, active: 1, unused: 0, without_roles: 0 },
      users: [{ ...USER, unused: false }],
    },
  },
};

const PAGES = [
  { path: '/app/administracion', ready: 'Revisión de accesos' },
  { path: '/app/administracion/usuarios', ready: 'Luis Gómez' },
  { path: `/app/administracion/usuarios/${LUIS}`, ready: 'Acciones sobre la cuenta' },
  { path: '/app/administracion/roles', ready: 'Gerente y analistas comerciales.' },
  { path: `/app/administracion/roles/${ROLE}`, ready: 'Los roles del sistema no se editan' },
  { path: '/app/administracion/roles/nuevo', ready: 'Crear el rol' },
  { path: '/app/administracion/delegaciones', ready: 'Todavía no hay delegaciones' },
  { path: '/app/administracion/revision-de-accesos', ready: 'Imprimir o guardar en PDF' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`administración en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, ADMIN_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('la interfaz oculta lo que la persona no puede hacer', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('sin roles, el menú no muestra Administración', async ({ page }) => {
    await mockPermissions(page, NO_PERMISSIONS);
    await page.goto('/app');
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Administración' })).toBeHidden();
    await expect(menu.getByRole('link', { name: 'Comercial' })).toBeHidden();
  });

  test('si escribe la dirección, ve «Sin permiso» y ningún dato', async ({ page }) => {
    await mockPermissions(page, NO_PERMISSIONS);
    await mockApi(page, ADMIN_API);
    await page.goto('/app/administracion/usuarios');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
    await expect(page.getByText('Luis Gómez')).toBeHidden();
  });

  test('con permisos, la lista lleva a la ficha', async ({ page }) => {
    await mockApi(page, ADMIN_API);
    await page.goto('/app/administracion/usuarios');
    await page.getByRole('link', { name: 'Luis Gómez' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/administracion/usuarios/${LUIS}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Luis Gómez' })).toBeVisible();
  });
});
