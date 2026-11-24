import { Module, type DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';

import type { Env } from '../config/env-schema.js';
import { assignCorrelationId } from '../correlation/correlation-id.js';

// Datos que nunca se registran (capítulo 11.2): credenciales, cookies, tokens y códigos de
// verificación. Los cuerpos de las peticiones no se registran nunca.
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.otp_code',
  '*.verification_code',
  // B43 (ASVS V16.2.5): claves al cambiarlas, secretos del segundo factor y del sello.
  '*.current_password',
  '*.new_password',
  '*.secret',
  '*.recovery_codes',
  '*.passphrase',
];

/** Opciones de los registros: JSON con el identificador de correlación de cada petición. */
export function buildPinoHttpOptions(config: Env): PinoHttpOptions {
  return {
    level: config.LOG_LEVEL,
    genReqId: assignCorrelationId,
    customProps: (request) => ({ correlation_id: request.id }),
    redact: { paths: REDACTED_PATHS, censor: '[oculto]' },
    base: { service: 'api', environment: config.APP_ENV },
  };
}

@Module({})
export class LoggingModule {
  static forRoot(config: Env): DynamicModule {
    return {
      module: LoggingModule,
      imports: [LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions(config) })],
    };
  }
}
