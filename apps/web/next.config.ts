import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import { STATIC_SECURITY_HEADERS, noIndexHeaders } from './src/lib/security/security-headers';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROOT_ENV_FILE = `${REPO_ROOT}.env`;

// Las variables de entorno viven en el .env de la raíz del repositorio (anexo F).
// Las que ya estén definidas en el proceso tienen prioridad.
if (existsSync(ROOT_ENV_FILE)) {
  process.loadEnvFile(ROOT_ENV_FILE);
}

const nextConfig: NextConfig = {
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
    ]);
  },
};

export default nextConfig;
