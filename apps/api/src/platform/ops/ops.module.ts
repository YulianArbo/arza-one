import { Global, Module } from '@nestjs/common';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { ERROR_REPORTER, errorReporterFor } from './error-reporter.js';
import { OpsController } from './ops.controller.js';
import { OpsStatusService } from './ops-status.service.js';
import { RequestMetrics } from './request-metrics.js';

/** Monitoreo de la API (B44): cifras para los vigilantes y envío de errores a GlitchTip. */
@Global()
@Module({
  controllers: [OpsController],
  providers: [
    OpsStatusService,
    { provide: RequestMetrics, useFactory: () => new RequestMetrics() },
    {
      provide: ERROR_REPORTER,
      useFactory: (config: Env) =>
        errorReporterFor({
          dsn: config.GLITCHTIP_DSN,
          environment: config.APP_ENV,
          release: config.GIT_COMMIT,
          service: 'api',
        }),
      inject: [CONFIG],
    },
  ],
  exports: [RequestMetrics, ERROR_REPORTER],
})
export class OpsModule {}
