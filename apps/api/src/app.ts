import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import type { Env } from './platform/config/env-schema.js';
import { setupApiDocs } from './platform/openapi/openapi.js';
import { allowedOrigins } from './platform/security/allowed-origins.js';
import { securityHeaders } from './platform/security/security-headers.js';

const MAX_BODY_SIZE = '1mb';

/** Ajustes de la aplicación HTTP que no son módulos de NestJS. Las pruebas usan los mismos. */
export function configureApp(app: NestExpressApplication, config: Env): void {
  // Caddy está delante de la API: la dirección IP real llega en X-Forwarded-For.
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(securityHeaders());
  app.enableCors({
    origin: allowedOrigins(config),
    credentials: true,
    // If-Match lleva la versión al editar (numeral 14.1); Idempotency-Key, la llave de una
    // operación que no se repite, como enviar a firma (B25).
    allowedHeaders: [
      'Content-Type',
      'X-Correlation-Id',
      'X-CSRF-Token',
      'If-Match',
      'Idempotency-Key',
    ],
    // Que la web lea el identificador de correlación y el nombre de una descarga (B11).
    exposedHeaders: ['X-Correlation-Id', 'Content-Disposition'],
  });
  app.useBodyParser('json', { limit: MAX_BODY_SIZE });
  setupApiDocs(app, config);
  app.enableShutdownHooks();
}

export async function createApp(config: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app, config);
  return app;
}
