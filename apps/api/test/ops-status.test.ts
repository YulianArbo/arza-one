import type { NestExpressApplication } from '@nestjs/platform-express';
import { opsStatusResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestMetrics } from '../src/platform/ops/request-metrics.js';
import { createTestApp } from './support/test-app.js';

// Cifras para los vigilantes (numeral 10.7, B44): solo con la llave MONITOR_TOKEN.

/** Llave ficticia: 40 caracteres repetidos (no parece un secreto real). */
const TOKEN = 'v'.repeat(40);
const QUIET = { pending: 3, failed: 0 };

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  queueFigures = QUIET,
  env: Record<string, string | undefined> = { MONITOR_TOKEN: TOKEN },
) {
  app = await createTestApp({ env, queueFigures });
  return app;
}

function status(server: NestExpressApplication, authorization?: string) {
  const call = request(server.getHttpServer()).get('/ops/status');
  return authorization === undefined ? call : call.set('Authorization', authorization);
}

describe('acceso a /ops/status', () => {
  it('sin llave responde 401', async () => {
    expect((await status(await start())).status).toBe(401);
  });

  it('con una llave equivocada responde 401', async () => {
    const response = await status(await start(), `Bearer ${TOKEN}-otra`);
    expect(response.status).toBe(401);
  });

  it('una cookie de sesión no sirve en lugar de la llave', async () => {
    const server = await start();
    const response = await request(server.getHttpServer())
      .get('/ops/status')
      .set('Cookie', '__Host-arza_session=cualquier-sesion');
    expect(response.status).toBe(401);
  });

  it('sin MONITOR_TOKEN configurada nadie entra, ni con una llave vacía', async () => {
    const server = await start(QUIET, { MONITOR_TOKEN: '' });
    expect((await status(server, 'Bearer ')).status).toBe(401);
    expect((await status(server, 'Bearer undefined')).status).toBe(401);
  });
});

describe('cifras de /ops/status', () => {
  it('con la llave responde 200 y solo cifras de la plataforma', async () => {
    const response = await status(await start(), `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    const body = opsStatusResponseSchema.parse(response.body);
    expect(body).toMatchObject({ status: 'ok', alerts: [], window_minutes: 10, queue: QUIET });
    expect(Object.keys(body).sort()).toEqual(
      ['alerts', 'error_rate', 'p95_ms', 'queue', 'requests', 'status', 'window_minutes'].sort(),
    );
  });

  it('más de 100 trabajos en espera o fallidos responde 503 con la alerta', async () => {
    const server = await start({ pending: 101, failed: 150 });
    const response = await status(server, `Bearer ${TOKEN}`);
    expect(response.status).toBe(503);
    expect(opsStatusResponseSchema.parse(response.body).alerts).toEqual([
      'queue_backlog',
      'queue_failed',
    ]);
  });

  it('una API lenta responde 503 con «slow_api»', async () => {
    const server = await start();
    const metrics = server.get(RequestMetrics);
    for (let index = 0; index < 20; index += 1) metrics.record(Date.now(), 900, 200);
    const response = await status(server, `Bearer ${TOKEN}`);
    expect(response.status).toBe(503);
    expect(opsStatusResponseSchema.parse(response.body)).toMatchObject({
      alerts: ['slow_api'],
      p95_ms: 900,
    });
  });

  it('cuenta las peticiones de la API, pero no las de los vigilantes', async () => {
    const server = await start();
    await request(server.getHttpServer()).get('/v1/auth/session');
    await status(server, `Bearer ${TOKEN}`);
    await request(server.getHttpServer()).get('/health');
    const body = opsStatusResponseSchema.parse((await status(server, `Bearer ${TOKEN}`)).body);
    expect(body.requests).toBe(1);
  });
});
