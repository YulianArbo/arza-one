import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { closeValkey, connectValkey } from './valkey-connection.js';

export const VALKEY = Symbol('VALKEY');

const logger = new Logger('Valkey');

async function createConnection(config: Env): Promise<Redis> {
  return connectValkey(config.VALKEY_URL, (error) => {
    // Solo el mensaje: la dirección de conexión lleva la contraseña.
    logger.warn(`Sin conexión con Valkey: ${error.message}`);
  });
}

@Injectable()
class ValkeyShutdown implements OnApplicationShutdown {
  constructor(@Inject(VALKEY) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await closeValkey(this.client);
  }
}

/** Pone la conexión compartida a Valkey a disposición de toda la API. */
@Global()
@Module({
  providers: [{ provide: VALKEY, useFactory: createConnection, inject: [CONFIG] }, ValkeyShutdown],
  exports: [VALKEY],
})
export class ValkeyModule {}
