import { readFileSync } from 'node:fs';

import type { VersionResponse } from '@arza/contracts';
import { z } from 'zod';

import type { Env } from '../config/env-schema.js';

export const VERSION_INFO = Symbol('VERSION_INFO');

// Misma profundidad desde src/ y desde dist/: apunta a apps/api/package.json.
const PACKAGE_JSON = new URL('../../../package.json', import.meta.url);

/** Lee la versión del paquete una sola vez, al arrancar. */
export function readVersionInfo(config: Env): VersionResponse {
  const manifest = z
    .object({ version: z.string() })
    .parse(JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')));
  return { version: manifest.version, environment: config.APP_ENV, commit: config.GIT_COMMIT };
}
