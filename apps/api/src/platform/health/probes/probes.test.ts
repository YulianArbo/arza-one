import { describe, expect, it } from 'vitest';

import { PostgresProbe } from './postgres-probe.js';
import { S3Probe } from './s3-probe.js';
import { ValkeyProbe } from './valkey-probe.js';

// Puerto 1: nadie escucha allí, así que cada revisión debe fallar rápido y sin colgarse.
const NOBODY = '127.0.0.1:1';

describe('revisiones de /health contra piezas que no responden', () => {
  it('PostgreSQL', async () => {
    const probe = new PostgresProbe(`postgresql://app_user:ficticia@${NOBODY}/arza_one`);
    expect(probe.component).toBe('database');
    await expect(probe.check()).rejects.toThrow();
  });

  it('Valkey', async () => {
    const probe = new ValkeyProbe(`redis://${NOBODY}`);
    expect(probe.component).toBe('queues');
    await expect(probe.check()).rejects.toThrow();
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
