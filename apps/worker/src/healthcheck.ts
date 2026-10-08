// Verificación de salud del contenedor del worker (numeral 10.3): sale con 0 si el worker de este
// contenedor emitió su latido en los últimos 45 segundos y con 1 si no.
import { hostname } from 'node:os';

import { Redis } from 'ioredis';

import { isAlive } from './heartbeat/heartbeat.js';

const TIMEOUT_MS = 3000;

async function check(): Promise<boolean> {
  const url = process.env['VALKEY_URL'];
  if (url === undefined || url === '') return false;
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    return await isAlive(client, hostname());
  } finally {
    client.disconnect();
  }
}

check()
  .then((alive) => {
    process.exitCode = alive ? 0 : 1;
  })
  .catch(() => {
    process.exitCode = 1;
  });
