import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { ValkeyProbe } from '../../src/platform/health/probes/valkey-probe.js';
import { closeValkey, connectValkey } from '../../src/platform/valkey/valkey-connection.js';
import { ValkeyThrottlerStorage } from '../../src/platform/valkey/valkey-throttler-storage.js';
import { createTestApp } from '../support/test-app.js';

// Límite de peticiones contado en Valkey real (numeral 13.1, paso 3; pendiente de B02).

const valkeyUrl = inject('valkeyUrl');
let client: Redis;
let storage: ValkeyThrottlerStorage;
let throttlerName = 0;

/** Un nombre distinto por prueba para que los conteos no se mezclen. */
function freshName(): string {
  throttlerName += 1;
  return `prueba-${String(throttlerName)}-${String(Date.now())}`;
}

beforeAll(async () => {
  client = await connectValkey(valkeyUrl, () => undefined);
  storage = new ValkeyThrottlerStorage(client);
});

afterAll(async () => {
  await closeValkey(client);
});

describe('conexión compartida a Valkey', () => {
  it('se conecta con contraseña y /health la ve arriba', async () => {
    expect(client.status).toBe('ready');
    await expect(new ValkeyProbe(client).check()).resolves.toBeUndefined();
  });

  it('rechaza una contraseña equivocada', async () => {
    const wrong = valkeyUrl.replace(/:[^:@]+@/, ':equivocada@');
    const errors: Error[] = [];
    const other = await connectValkey(wrong, (error) => errors.push(error));
    await expect(new ValkeyProbe(other).check()).rejects.toThrow();
    expect(errors.map((error) => error.message).join(' ')).toMatch(/WRONGPASS|invalid/i);
    await closeValkey(other);
  });
});

describe('conteo en Valkey', () => {
  it('bloquea al superar el límite e informa cuánto falta', async () => {
    const name = freshName();
    const hits = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      hits.push(await storage.increment('cliente', 60_000, 3, 30_000, name));
    }
    expect(hits.map((hit) => hit.isBlocked)).toEqual([false, false, false, true]);
    expect(hits[0]?.timeToExpire).toBe(60);
    expect(hits[3]?.timeToBlockExpire).toBe(30);
  });

  it('el bloqueo y la ventana vencen solos', async () => {
    const name = freshName();
    await storage.increment('cliente', 300, 1, 300, name);
    expect((await storage.increment('cliente', 300, 1, 300, name)).isBlocked).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const after = await storage.increment('cliente', 300, 1, 300, name);
    expect(after).toMatchObject({ isBlocked: false, totalHits: 1 });
  });

  it('cuenta exacto con peticiones simultáneas', async () => {
    const name = freshName();
    const results = await Promise.all(
      Array.from({ length: 25 }, async () =>
        storage.increment('cliente', 60_000, 10, 60_000, name),
      ),
    );
    expect(results.filter((result) => !result.isBlocked)).toHaveLength(10);
  });

  it('cada cliente tiene su propio conteo', async () => {
    const name = freshName();
    await storage.increment('cliente-a', 60_000, 1, 60_000, name);
    expect((await storage.increment('cliente-b', 60_000, 1, 60_000, name)).isBlocked).toBe(false);
  });
});

describe('la API completa con el conteo en Valkey', () => {
  const apps: NestExpressApplication[] = [];

  async function startApi(): Promise<NestExpressApplication> {
    const app = await createTestApp({
      env: { VALKEY_URL: valkeyUrl, RATE_LIMIT_MAX_REQUESTS: '3' },
      realThrottlerStorage: true,
    });
    apps.push(app);
    return app;
  }

  afterAll(async () => {
    await Promise.all(apps.map(async (app) => app.close()));
  });

  it('responde 429 al superar el límite, y otra copia de la API respeta el mismo conteo', async () => {
    const first = await startApi();
    const ip = '198.51.100.23';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(first.getHttpServer())
        .get('/version')
        .set('X-Forwarded-For', ip);
      expect(response.status).toBe(200);
    }
    // Una segunda copia (o la misma API reiniciada) ve el conteo guardado en Valkey.
    const second = await startApi();
    const response = await request(second.getHttpServer())
      .get('/version')
      .set('X-Forwarded-For', ip);
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });
});
