import { loadEnv } from '@arza/api/platform';

import { workerEnvSchema, type WorkerEnv } from './env-schema.js';

/** Valida las variables al arrancar (numeral 13.2): el worker no arranca si falta una. */
export function loadWorkerConfig(raw: Record<string, string | undefined>): WorkerEnv {
  return loadEnv(workerEnvSchema, raw, 'El worker');
}
