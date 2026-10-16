import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import {
  accessibilityViolations,
  expect,
  test,
  useTheme,
  waitForAppShell,
} from './support/fixtures';

// Pantallas de B16: la campanita, el centro de avisos, las preferencias y las plantillas, con
// accesibilidad WCAG 2.2 AA en modo claro y oscuro. Los comentarios y adjuntos se revisan en la
// ficha del tercero (parties.spec.ts).

const NOTICE = {
  id: '01999a00-0000-7000-8000-0000000f0001',
  kind: 'task_assigned',
  title: 'Nueva tarea: Revisar la cotización',
  body: 'Le asignaron la tarea «Revisar la cotización». Vence: 16/10/2026, 4:00 p. m.',
  link: '/app/mis-tareas/01999a00-0000-7000-8000-0000000e0001',
  delivered_at: '2026-10-13T14:30:00.000Z',
  read_at: null,
};
const TEMPLATE = {
  kind: 'security_alert',
  label: 'Alerta de seguridad',
  variables: ['nombre', 'alerta', 'fecha'],
  subject: 'Alerta de seguridad en ARZA ONE: {{alerta}}',
  body: 'Se registró una alerta de seguridad el {{fecha}}: {{alerta}}.',
  urgent: true,
  version: 1,
  updated_at: '2026-10-13T14:30:00.000Z',
};
const PREFERENCES = {
  items: [
    { kind: 'task_assigned', label: 'Le asignaron una tarea', email: true, urgent: false },
    { kind: 'security_alert', label: 'Alerta de seguridad', email: true, urgent: true },
  ],
};
const NTF_API: ApiRoutes = {
  '/v1/me/notifications': { body: { items: [NOTICE], unread_count: 1 } },
  '/v1/me/notification-preferences': { body: PREFERENCES },
  '/v1/notification-templates': { body: { items: [TEMPLATE] } },
};

const PAGES = [
  { path: '/app/avisos', ready: 'Nueva tarea: Revisar la cotización' },
  { path: '/app/perfil/avisos', ready: 'Avisos por correo' },
  { path: '/app/administracion/plantillas', ready: 'Guardar versión nueva' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`avisos en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, NTF_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('campanita', () => {
  test('dice cuántos avisos hay sin leer y lleva al centro de avisos', async ({ page }) => {
    await mockApi(page, NTF_API);
    await page.goto('/app');
    await waitForAppShell(page);
    // Con el menú abierto, Radix oculta el resto de la página al lector de pantalla: se revisa
    // la barra con la cifra de avisos antes de abrirlo, igual que los demás menús.
    expect(await accessibilityViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'Avisos: 1 sin leer' }).click();
    await expect(page.getByRole('menuitem', { name: /Revisar la cotización/ })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Ver todos los avisos' }).click();
    await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible();
  });
});

test.describe('quien no administra plantillas', () => {
  test('ve «Sin permiso» si escribe la dirección', async ({ page }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, NTF_API);
    await page.goto('/app/administracion/plantillas');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});
