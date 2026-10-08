import { REDACTED_PATHS } from '@arza/api/platform';
import { pino, type DestinationStream, type Logger } from 'pino';

import type { WorkerEnv } from '../config/env-schema.js';

/**
 * Registros JSON del worker, con las mismas reglas que la API (capítulo 11.2): nunca contraseñas,
 * tokens ni datos personales. Los datos de un trabajo no se registran; solo su identificador,
 * su nombre, la empresa y el identificador de correlación.
 */
export function createLogger(
  config: Pick<WorkerEnv, 'LOG_LEVEL' | 'APP_ENV'>,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: '[oculto]' },
    base: { service: 'worker', environment: config.APP_ENV },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
