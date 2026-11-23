import { afterEach, expect, it, vi } from 'vitest';

import { isPublishedPage } from './published-page';

// El servidor del sitio solo muestra una página institucional si la API confirma que está publicada
// (B41); lo demás responde 404.

const API = 'http://127.0.0.1:4999';

afterEach(() => vi.restoreAllMocks());

it('una página publicada existe y se pregunta por su dirección', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
  expect(await isPublishedPage(API, 'nosotros', fetcher)).toBe(true);
  expect(fetcher.mock.calls[0]?.[0]).toEqual(new URL(`${API}/v1/public/pages/nosotros`));
});

it('si la API dice que no existe, o no responde, la página no existe', async () => {
  const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 }));
  expect(await isPublishedPage(API, 'otra', missing)).toBe(false);
  const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
  expect(await isPublishedPage(API, 'otra', down)).toBe(false);
});

it('una dirección inválida o reservada ni siquiera se consulta', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await isPublishedPage(API, 'Con Espacios', fetcher)).toBe(false);
  expect(await isPublishedPage(API, 'app', fetcher)).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
