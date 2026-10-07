import pg from 'pg';

import { PROBE_TIMEOUT_MS, type HealthProbe } from '../health-probe.js';

/** Abre una conexión a PostgreSQL y ejecuta SELECT 1. */
export class PostgresProbe implements HealthProbe {
  readonly component = 'database';

  constructor(private readonly connectionString: string) {}

  async check(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: PROBE_TIMEOUT_MS,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
