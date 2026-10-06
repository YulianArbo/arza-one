import { Module } from '@nestjs/common';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { HEALTH_PROBES, type HealthProbe } from './health-probe.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { PostgresProbe } from './probes/postgres-probe.js';
import { S3Probe } from './probes/s3-probe.js';
import { ValkeyProbe } from './probes/valkey-probe.js';

function createProbes(config: Env): HealthProbe[] {
  return [
    new PostgresProbe(config.DATABASE_URL),
    new ValkeyProbe(config.VALKEY_URL),
    new S3Probe({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    }),
  ];
}

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: HEALTH_PROBES, useFactory: createProbes, inject: [CONFIG] },
  ],
})
export class HealthModule {}
