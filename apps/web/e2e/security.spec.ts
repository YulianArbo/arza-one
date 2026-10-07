import { mockHealthyApi } from './support/api-mock';
import { E2E_API_URL } from './support/environment';
import { expect, test } from './support/fixtures';

// Cabeceras de seguridad (15.6) y recursos solo propios (criterio de B04). Además, cada
// prueba de esta carpeta falla si la página intenta conectarse a un dominio de terceros.

test('la política de seguridad solo permite recursos propios y la API', async ({ page }) => {
  const response = await page.goto('/app');
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'self'");
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(policy).not.toContain('unsafe-eval');
  expect(policy).toContain(`connect-src 'self' ${E2E_API_URL}`);
  expect(policy).toContain("frame-ancestors 'none'");
});

test('cada página recibe un nonce distinto', async ({ page }) => {
  const first = await page.goto('/');
  const second = await page.goto('/');
  expect(first?.headers()['content-security-policy']).not.toBe(
    second?.headers()['content-security-policy'],
  );
});

test('la aplicación interna y el portal no se indexan', async ({ page }) => {
  for (const path of ['/app', '/portal']) {
    const response = await page.goto(path);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  const publicSite = await page.goto('/');
  expect(publicSite?.headers()['x-robots-tag']).toBeUndefined();
});

test('cabeceras generales de seguridad', async ({ page }) => {
  const headers = (await page.goto('/'))?.headers() ?? {};
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('las tipografías se sirven desde el propio servidor', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
  });
  await mockHealthyApi(page);
  await page.goto('/app/sistema-de-diseno');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => ({
    inter: document.fonts.check('400 14px Inter'),
    montserrat: document.fonts.check('700 24px Montserrat'),
  }));
  expect(loaded).toEqual({ inter: true, montserrat: true });
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) {
    expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  }
});
