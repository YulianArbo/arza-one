import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from './support/test-app.js';

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp({ env: { RATE_LIMIT_MAX_REQUESTS: '3' } });
});

afterAll(async () => {
  await app.close();
});

describe('límite de peticiones (numeral 13.1, paso 3)', () => {
  it('responde 429 con el formato único al superar el límite', async () => {
    const server = app.getHttpServer();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await request(server).get('/version')).status).toBe(200);
    }
    const response = await request(server).get('/version');
    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });

  it('cuenta por separado a cada dirección IP detrás del proxy', async () => {
    const response = await request(app.getHttpServer())
      .get('/version')
      .set('X-Forwarded-For', '203.0.113.7');
    expect(response.status).toBe(200);
  });
});
