import type { Redis } from 'ioredis';

import type { HealthProbe } from '../health-probe.js';

/** Envía PING por la conexión compartida de la API (pendiente de B02 y B03). */
export class ValkeyProbe implements HealthProbe {
  readonly component = 'queues';

  constructor(private readonly client: Pick<Redis, 'ping'>) {}

  async check(): Promise<void> {
    await this.client.ping();
  }
}
