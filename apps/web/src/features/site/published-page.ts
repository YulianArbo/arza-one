import { pageSlugSchema } from '@arza/contracts';

// Antes de mostrar una página institucional (B41) el servidor del sitio pregunta a la API si existe y
// está publicada, para que una dirección inexistente responda 404 y no una página en blanco con 200.
// Si la API no lo confirma (no existe, no responde o tarda), la dirección se trata como inexistente.

const CHECK_TIMEOUT_MS = 3000;

export async function isPublishedPage(
  apiUrl: string,
  slug: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!pageSlugSchema.safeParse(slug).success) return false;
  try {
    const response = await fetcher(new URL(`/v1/public/pages/${slug}`, apiUrl), {
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
