import { NO_PERMISSIONS, mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de la auditoría (B11, M19): accesibilidad WCAG 2.2 AA en modo claro y oscuro, el menú
// y «Sin permiso» al entrar por la dirección.

const EVENT = {
  id: '01999a00-0000-7000-8000-00000000e101',
  seq: 42,
  occurred_at: '2026-10-09T20:15:00.000Z',
  actor: {
    kind: 'user',
    id: '01999a00-0000-7000-8000-00000000a001',
    email: 'ana@demo-uno.test',
    display_name: 'Ana Pérez',
  },
  action: 'iam.role.update',
  entity_type: 'iam_role',
  entity_id: '01999a00-0000-7000-8000-00000000c002',
  result: 'success',
  changes: { name: { from: 'Apoyo', to: 'Apoyo comercial' } },
  ip: '203.0.113.7',
  correlation_id: null,
  hash: 'a'.repeat(64),
};

const AUDIT_API: ApiRoutes = {
  '/v1/audit-events': { body: { data: [EVENT], next_cursor: null } },
  '/v1/security-events': {
    body: {
      data: [
        {
          id: '01999a00-0000-7000-8000-00000000e201',
          occurred_at: '2026-10-09T19:00:00.000Z',
          type: 'iam.account.locked',
          severity: 'high',
          user: { id: EVENT.actor.id, email: EVENT.actor.email, display_name: 'Ana Pérez' },
          ip: '203.0.113.7',
          detail: { failures: 10 },
        },
      ],
      next_cursor: null,
    },
  },
  '/v1/audit-exports': { body: { data: [], next_cursor: null } },
};

const PAGES = [
  { path: '/app/auditoria', ready: 'Editó un rol' },
  { path: '/app/auditoria/seguridad', ready: 'Cuenta bloqueada por intentos fallidos' },
  { path: '/app/auditoria/exportaciones', ready: 'Todavía no hay exportaciones' },
  { path: '/app/auditoria/integridad', ready: 'Verificar ahora' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`auditoría en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, AUDIT_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('la auditoría solo la ve quien puede', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('con permiso, el menú lleva a la auditoría y sus secciones', async ({ page }) => {
    await mockApi(page, AUDIT_API);
    await page.goto('/app');
    await page
      .getByRole('navigation', { name: 'Menú principal' })
      .getByRole('link', { name: 'Auditoría' })
      .click();
    await expect(page).toHaveURL(/\/app\/auditoria$/);
    const sections = page.getByRole('navigation', { name: 'Secciones de la auditoría' });
    await sections.getByRole('link', { name: 'Eventos de seguridad' }).click();
    await expect(page.getByText('Cuenta bloqueada por intentos fallidos')).toBeVisible();
  });

  test('sin roles, no está en el menú y la dirección muestra «Sin permiso»', async ({ page }) => {
    await mockPermissions(page, NO_PERMISSIONS);
    await mockApi(page, AUDIT_API);
    await page.goto('/app/auditoria');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
    await expect(page.getByText('Editó un rol')).toBeHidden();
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(menu.getByRole('link', { name: 'Auditoría' })).toBeHidden();
  });
});
