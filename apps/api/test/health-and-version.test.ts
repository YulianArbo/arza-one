import type { NestExpressApplication } from '@nestjs/platform-express';
import { healthResponseSchema, versionResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestAppOptions } from './support/test-app.js';

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function getPath(path: string, options: TestAppOptions = {}): Promise<request.Response> {
  app = await createTestApp(options);
  return request(app.getHttpServer()).get(path);
}

describe('/health', () => {
  it('responde 200 y ok cuando todas las piezas responden', async () => {
    const response = await getPath('/health');
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      checks: { database: 'up', queues: 'up', files: 'up' },
    });
  });

  it('responde 503 y señala la pieza caída', async () => {
    const response = await getPath('/health', { downComponents: ['queues'] });
    expect(response.status).toBe(503);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'degraded',
      checks: { database: 'up', queues: 'down', files: 'up' },
    });
  });

  it('no revela el motivo interno de la falla', async () => {
    const response = await getPath('/health', { downComponents: ['database', 'files'] });
    expect(response.text).not.toContain('caída simulada');
  });

  it('es pública: responde sin sesión', async () => {
    expect((await getPath('/health')).status).not.toBe(401);
  });
});

describe('/version', () => {
  it('informa versión, ambiente y commit', async () => {
    const response = await getPath('/version', {
      env: { APP_ENV: 'staging', GIT_COMMIT: 'abc1234' },
    });
    expect(response.status).toBe(200);
    expect(versionResponseSchema.parse(response.body)).toEqual({
      version: '0.1.0',
      environment: 'staging',
      commit: 'abc1234',
    });
  });
});
