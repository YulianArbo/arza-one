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
      useFactory: (config: Env) => new DatabaseService(config.DATABASE_URL),
      inject: [CONFIG],
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
