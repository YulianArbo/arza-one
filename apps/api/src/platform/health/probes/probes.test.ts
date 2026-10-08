import { describe, expect, it } from 'vitest';

import { DatabaseService } from '../../database/database.service.js';
import { closeValkey, connectValkey } from '../../valkey/valkey-connection.js';
import { PostgresProbe } from './postgres-probe.js';
import { S3Probe } from './s3-probe.js';
import { ValkeyProbe } from './valkey-probe.js';

// Puerto 1: nadie escucha allí, así que cada revisión debe fallar rápido y sin colgarse.
const NOBODY = '127.0.0.1:1';

describe('revisiones de /health contra piezas que no responden', () => {
  it('PostgreSQL, por la conexión compartida de la API', async () => {
    const database = new DatabaseService(`postgresql://app_user:ficticia@${NOBODY}/arza_one`);
    const probe = new PostgresProbe(database);
    expect(probe.component).toBe('database');
    await expect(probe.check()).rejects.toThrow();
    await database.onModuleDestroy();
  });

  it('Valkey, por la conexión compartida de la API', async () => {
    const client = await connectValkey(`redis://${NOBODY}`, () => undefined);
    const probe = new ValkeyProbe(client);
    expect(probe.component).toBe('queues');
    await expect(probe.check()).rejects.toThrow();
    await closeValkey(client);
  });

  it('almacenamiento S3', async () => {
    const probe = new S3Probe({
      endpoint: `http://${NOBODY}`,
      region: 'garage',
      bucket: 'arza-one-test',
      accessKeyId: 'ficticia',
      secretAccessKey: 'ficticia',
    });
    expect(probe.component).toBe('files');
    await expect(probe.check()).rejects.toThrow();
  });
});
