import { Global, Module } from '@nestjs/common';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { DatabaseService } from './database.service.js';

/** Pone la conexión compartida a la base de datos a disposición de toda la API. */
@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: (config: Env) => {
        const transaction =
          config.DATABASE_TRANSACTION_MAX_WAIT_MS === undefined &&
          config.DATABASE_TRANSACTION_TIMEOUT_MS === undefined
            ? undefined
            : {
                ...(config.DATABASE_TRANSACTION_MAX_WAIT_MS === undefined
                  ? {}
                  : { maxWait: config.DATABASE_TRANSACTION_MAX_WAIT_MS }),
                ...(config.DATABASE_TRANSACTION_TIMEOUT_MS === undefined
                  ? {}
                  : { timeout: config.DATABASE_TRANSACTION_TIMEOUT_MS }),
              };
        return new DatabaseService(config.DATABASE_URL, {
          requireAudit: true,
          connectTimeoutMs: config.DATABASE_CONNECT_TIMEOUT_MS,
          ...(transaction === undefined ? {} : { transaction }),
        });
      },
      inject: [CONFIG],
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
