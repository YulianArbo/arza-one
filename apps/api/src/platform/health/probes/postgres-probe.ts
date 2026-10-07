import type { HealthProbe } from '../health-probe.js';

/** Lo único que la revisión necesita de la base de datos. */
export interface DatabasePing {
  ping(): Promise<void>;
}

/** Ejecuta SELECT 1 por la conexión compartida de la API. */
export class PostgresProbe implements HealthProbe {
  readonly component = 'database';

  constructor(private readonly database: DatabasePing) {}

  async check(): Promise<void> {
    await this.database.ping();
  }
}
