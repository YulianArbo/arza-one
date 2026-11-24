import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import {
  PRIVATE_PAGES,
  STATIC_SECURITY_HEADERS,
  noIndexHeaders,
} from './src/lib/security/security-headers';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOT_ENV_FILE = `${REPO_ROOT}.env`;

// Las variables de entorno viven en el .env de la raíz del repositorio (anexo F).
// Las que ya estén definidas en el proceso tienen prioridad.
if (existsSync(ROOT_ENV_FILE)) {
  process.loadEnvFile(ROOT_ENV_FILE);
}

// La imagen Docker (B05) usa la salida autónoma: solo lo necesario para ejecutar la web.
// En el equipo y en las pruebas en navegador se sigue usando `next start`.
const standaloneOutput: Partial<NextConfig> =
  process.env['NEXT_OUTPUT'] === 'standalone'
    ? { output: 'standalone', outputFileTracingRoot: REPO_ROOT }
    : {};

const nextConfig: NextConfig = {
  ...standaloneOutput,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: REPO_ROOT },
  // Las instrucciones para Claude Code viven en CLAUDE.md; no se generan archivos adicionales.
  agentRules: false,
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: STATIC_SECURITY_HEADERS },
      // Aplicación interna y portal: nunca indexables (numeral 15.6).
      { source: '/app/:path*', headers: noIndexHeaders() },
      { source: '/portal/:path*', headers: noIndexHeaders() },
      // Acceso, firma, cotización, encuesta y baja (B08, B43): tampoco se indexan ni se guardan.
      ...PRIVATE_PAGES.map((source) => ({ source, headers: noIndexHeaders() })),
    ]);
  },
};

export default nextConfig;
