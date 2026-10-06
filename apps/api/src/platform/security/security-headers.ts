import type { NextFunction, Request, RequestHandler, Response } from 'express';
import helmet from 'helmet';

export const API_DOCS_PATH = '/api/docs';

const ONE_YEAR_SECONDS = 31_536_000;

const sharedHelmetOptions = {
  strictTransportSecurity: { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
  xFrameOptions: { action: 'deny' as const },
};

// La API solo entrega JSON: no necesita cargar ningún recurso (numeral 15.6).
const apiHeaders = helmet({
  ...sharedHelmetOptions,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  },
});

// La documentación (solo local y pruebas) es una página de Swagger UI con estilos en línea.
const docsHeaders = helmet({
  ...sharedHelmetOptions,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
    },
  },
});

function extraHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function helmetFor(request: Request, response: Response, next: NextFunction): void {
  const handler = request.path.startsWith(API_DOCS_PATH) ? docsHeaders : apiHeaders;
  handler(request, response, next);
}

/** Cabeceras de seguridad del numeral 15.6 para toda respuesta de la API. */
export function securityHeaders(): RequestHandler[] {
  return [helmetFor, extraHeaders];
}
