import { mockApi, mockSession } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';
import { ACCEPTED_TERMS, PENDING_TERMS, PORTAL_API, PORTAL_PAGES } from './support/portal-api';

// Portal del cliente (B22A y B30): cada sección carga sin violaciones de accesibilidad en claro y
// oscuro, el primer ingreso pide aceptar los términos, y en celular (390 px) nada se desborda.
// La API está simulada con datos ficticios.

for (const theme of ['light', 'dark'] as const) {
  test.describe(`portal sin violaciones en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready } of PORTAL_PAGES) {
      test(`${path} carga sin violaciones`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockSession(page, 'portal');
        await mockApi(page, PORTAL_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test('las pestañas llevan a cada sección y marcan la actual', async ({ page }) => {
  await mockSession(page, 'portal');
  await mockApi(page, PORTAL_API);
  await page.goto('/portal');
  const tabs = page.getByRole('navigation', { name: 'Secciones del portal' });
  await expect(tabs.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Soporte' }).click();
  await expect(page).toHaveURL(/\/portal\/soporte$/);
  await expect(tabs.getByRole('link', { name: 'Soporte' })).toHaveAttribute('aria-current', 'page');
  // B22B: en una sección, la ruta arriba ofrece volver al inicio del portal.
  await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toHaveText(
    'Portal de clientes / Soporte',
  );
  await page.getByRole('link', { name: 'Volver al portal' }).click();
  await expect(page).toHaveURL(/\/portal$/);
});

test('el primer ingreso pide aceptar los términos vigentes', async ({ page }) => {
  let terms: unknown = PENDING_TERMS;
  await mockSession(page, 'portal');
  await mockApi(page, {
    ...PORTAL_API,
    '/v1/portal/terms': () => ({ body: terms }),
    '/v1/portal/terms/acceptance': () => {
      terms = ACCEPTED_TERMS;
      return { status: 204, body: null };
    },
  });
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'Antes de empezar' })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.getByLabel(/Leí y acepto/u).check();
  await page.getByRole('button', { name: 'Aceptar y continuar' }).click();
  await expect(page.getByText('Su espacio de cliente')).toBeVisible();
});

// Como en la aplicación interna (shell.spec.ts): la pantalla de carga ya salió con código 200, así
// que se comprueba la página clara y que no se indexe.
test('una sección que no existe muestra la página clara y no se indexa', async ({ page }) => {
  await mockSession(page, 'portal');
  await mockApi(page, PORTAL_API);
  await page.goto('/portal/otra');
  await expect(page.getByText('No encontramos esta página')).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
});

test.describe('portal en celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const { path, ready } of PORTAL_PAGES) {
    test(`${path} cabe en 390 px sin desbordar`, async ({ page }) => {
      await mockSession(page, 'portal');
      await mockApi(page, PORTAL_API);
      await page.goto(path);
      await expect(page.getByText(ready).first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test('la empresa cliente de la persona aparece arriba a la derecha (B22A)', async ({ page }) => {
  await mockSession(page, 'portal');
  await mockApi(page, {
    ...PORTAL_API,
    '/v1/me/company': {
      body: {
        company: {
          id: '01999a00-0000-7000-8000-0000000f0001',
          name: 'Demo Uno S.A.S.',
          has_logo: false,
        },
      },
    },
  });
  await page.goto('/portal');
  await expect(page.getByRole('banner').getByText('Demo Uno S.A.S.')).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
});
