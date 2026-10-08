import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { DatabaseService } from '../database/database.service.js';
import { HEALTH_PROBES, type HealthProbe } from './health-probe.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { PostgresProbe } from './probes/postgres-probe.js';
import { S3Probe } from './probes/s3-probe.js';
import { ValkeyProbe } from './probes/valkey-probe.js';
import { VALKEY } from '../valkey/valkey.module.js';

function createProbes(config: Env, database: DatabaseService, valkey: Redis): HealthProbe[] {
  return [
    new PostgresProbe(database),
    new ValkeyProbe(valkey),
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
    { provide: HEALTH_PROBES, useFactory: createProbes, inject: [CONFIG, DatabaseService, VALKEY] },
  ],
})
export class HealthModule {}
