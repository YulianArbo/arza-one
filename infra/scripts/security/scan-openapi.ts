// Uso: node infra/scripts/security/scan-openapi.ts <openapi.json> <salida.json> <url-de-la-api>
//
// El OpenAPI que ZAP ataca con la sesión de análisis (B43): sin las rutas que la cerrarían y con
// la dirección de la API dentro de la red de Docker.
import { readFileSync, writeFileSync } from 'node:fs';

import { SESSION_ROUTES, withoutSessionRoutes } from './scan-auth.ts';

const [input, output, server] = process.argv.slice(2);
if (input === undefined || output === undefined || server === undefined) {
  process.stderr.write('Uso: node scan-openapi.ts <openapi.json> <salida.json> <url-de-la-api>\n');
  process.exitCode = 2;
} else {
  const document = JSON.parse(readFileSync(input, 'utf8')) as Record<string, unknown>;
  const filtered = withoutSessionRoutes(document, SESSION_ROUTES);
  writeFileSync(output, JSON.stringify({ ...filtered, servers: [{ url: server }] }));
  const kept = Object.keys(filtered.paths ?? {}).length;
  process.stdout.write(`OpenAPI para el análisis: ${String(kept)} rutas.\n`);
}
