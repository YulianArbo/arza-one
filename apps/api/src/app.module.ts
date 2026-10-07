import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { AccessGuard } from './platform/access/access.guard.js';
import { ConfigModule } from './platform/config/config.module.js';
import type { Env } from './platform/config/env-schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { VersionModule } from './platform/version/version.module.js';

const MILLISECONDS_PER_SECOND = 1000;

/**
 * Cadena de petición del numeral 13.1. Los guardas se ejecutan en el orden en que se registran:
 * primero el límite de peticiones (paso 3) y después el acceso (paso 4).
 */
@Module({})
export class AppModule {
  static forRoot(config: Env): DynamicModule {
    const throttle = {
      ttl: config.RATE_LIMIT_WINDOW_SECONDS * MILLISECONDS_PER_SECOND,
      limit: config.RATE_LIMIT_MAX_REQUESTS,
    };
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config),
        DatabaseModule,
        ThrottlerModule.forRoot([throttle]),
        HealthModule,
        VersionModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
