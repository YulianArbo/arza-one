import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { AssetModule } from './modules/asset/index.js';
import { HrModule } from './modules/hr/index.js';
import { SstModule } from './modules/sst/index.js';
import { QmsModule } from './modules/qms/index.js';
import { InnModule } from './modules/inn/index.js';
import { WebModule } from './modules/web/index.js';
import { AuditModule } from './modules/audit/index.js';
import { ContractModule } from './modules/contract/index.js';
import { ProjectModule } from './modules/project/index.js';
import { ServiceModule } from './modules/service/index.js';
import { PortalModule } from './modules/portal/index.js';
import { CoreModule } from './modules/core/index.js';
import { CrmModule } from './modules/crm/index.js';
import { DocModule, ProfileImagesModule } from './modules/doc/index.js';
import { FinModule } from './modules/fin/interface/fin.module.js';
import { IamModule } from './modules/iam/index.js';
import { PartyModule } from './modules/party/index.js';
import { NtfModule } from './modules/ntf/index.js';
import { PrivacyModule } from './modules/privacy/index.js';
import { PurchaseModule } from './modules/purchase/index.js';
import { WfModule } from './modules/wf/index.js';
import { AccessGuard } from './platform/access/access.guard.js';
import { AuthorizationGuard } from './platform/access/authorization.guard.js';
import { ClockModule } from './platform/clock/clock.js';
import { ConfigModule } from './platform/config/config.module.js';
import type { Env } from './platform/config/env-schema.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ApiExceptionFilter } from './platform/errors/api-exception.filter.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { QueueModule } from './platform/queues/queue.module.js';
import { CsrfGuard } from './platform/security/csrf.guard.js';
import { ValkeyThrottlerStorage } from './platform/valkey/valkey-throttler-storage.js';
import { VALKEY, ValkeyModule } from './platform/valkey/valkey.module.js';
import { VersionModule } from './platform/version/version.module.js';

const MILLISECONDS_PER_SECOND = 1000;

/** Módulos de negocio (capítulo 7), en el orden en que se construyeron. */
const BUSINESS_MODULES = [
  IamModule,
  AuditModule,
  CoreModule,
  PartyModule,
  DocModule,
  ProfileImagesModule,
  WfModule,
  NtfModule,
  PrivacyModule,
  FinModule,
  CrmModule,
  ContractModule,
  ProjectModule,
  ServiceModule,
  PortalModule,
  PurchaseModule,
  AssetModule,
  HrModule,
  SstModule,
  QmsModule,
  InnModule,
  WebModule,
];

/**
 * Cadena de petición del numeral 13.1. Los guardas se ejecutan en el orden en que se registran:
 * primero el límite de peticiones (paso 3), después la sesión (paso 4) y luego la protección
 * contra peticiones falsificadas (paso 5).
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
        ValkeyModule,
        ThrottlerModule.forRootAsync({
          inject: [VALKEY],
          useFactory: (valkey: Redis) => ({
            throttlers: [throttle],
            storage: new ValkeyThrottlerStorage(valkey),
          }),
        }),
        ClockModule,
        QueueModule,
        HealthModule,
        VersionModule,
        ...BUSINESS_MODULES,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    };
  }
}
