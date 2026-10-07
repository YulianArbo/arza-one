import { NextResponse, type NextRequest } from 'next/server';

import { apiOrigin, loadWebEnv } from './lib/config/web-env';
import { buildContentSecurityPolicy } from './lib/security/security-headers';

/**
 * Antes de cada página: genera un nonce nuevo y fija la política de seguridad del contenido.
 * Next.js lee la política de la petición y firma sus propios scripts con ese nonce.
 */
export function proxy(request: NextRequest): NextResponse {
  const env = loadWebEnv();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildContentSecurityPolicy({
    nonce,
    apiOrigin: apiOrigin(env),
    isDevelopment: env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Los archivos estáticos no ejecutan scripts: no necesitan nonce.
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
