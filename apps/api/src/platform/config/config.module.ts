import { Global, Module, type DynamicModule } from '@nestjs/common';

import type { Env } from './env-schema.js';

export const CONFIG = Symbol('CONFIG');

/** Pone la configuración ya validada a disposición de toda la API. */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: config }],
      exports: [CONFIG],
    };
  }
}
