import type { Env } from '../config/env-schema.js';

/** Orígenes propios de la plataforma: los únicos que pueden llamar a la API desde un navegador. */
export function allowedOrigins(
  config: Pick<Env, 'APP_URL' | 'PORTAL_URL' | 'PUBLIC_URL'>,
): string[] {
  return [...new Set([config.APP_URL, config.PORTAL_URL, config.PUBLIC_URL])].map(
    (url) => new URL(url).origin,
  );
}
