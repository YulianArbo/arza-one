import { expect, test } from './support/fixtures';

// Verificación de salud de la web (numeral 10.3): Docker y las pruebas de humo la consultan (B07).

test('/healthz responde que la web está viva, sin guardarse en caché', async ({ request }) => {
  const response = await request.get('/healthz');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });
});
