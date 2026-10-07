// Cabeceras de seguridad de la web (numeral 15.6). En producción Caddy también las aplica.

interface Header {
  key: string;
  value: string;
}

const ONE_YEAR_SECONDS = 31_536_000;

export const STATIC_SECURITY_HEADERS: Header[] = [
  {
    key: 'Strict-Transport-Security',
    value: `max-age=${String(ONE_YEAR_SECONDS)}; includeSubDomains; preload`,
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** Aplicación interna y portal: sin indexación y sin copias en caché. */
export function noIndexHeaders(): Header[] {
  return [
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    { key: 'Cache-Control', value: 'no-store' },
  ];
}

export interface ContentSecurityPolicyOptions {
  /** Valor aleatorio por petición que autoriza los scripts propios de Next.js. */
  nonce: string;
  /** Origen de la API (por ejemplo http://localhost:4000), único destino de datos permitido. */
  apiOrigin: string;
  /** En desarrollo React necesita evaluar código para mostrar los errores. */
  isDevelopment: boolean;
}

/**
 * Política de seguridad del contenido (numeral 15.6): todo se carga del propio servidor,
 * sin scripts en línea salvo los de Next.js firmados con el nonce, y los datos solo van a la API.
 */
export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const scriptSources = ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'"];
  if (options.isDevelopment) {
    scriptSources.push("'unsafe-eval'");
  }
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    // Radix posiciona menús y ventanas con estilos en línea; el manual solo los prohíbe en scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${options.apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join('; ');
}
