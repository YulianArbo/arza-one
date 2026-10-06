import { Redis } from 'ioredis';

import { PROBE_TIMEOUT_MS, type HealthProbe } from '../health-probe.js';

/** Abre una conexión a Valkey y envía PING. */
export class ValkeyProbe implements HealthProbe {
  readonly component = 'queues';

  constructor(private readonly url: string) {}

  async check(): Promise<void> {
    const client = new Redis(this.url, {
      lazyConnect: true,
      connectTimeout: PROBE_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    // El fallo ya llega por la promesa de connect(); sin esto ioredis lo repite en consola.
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  }
}
