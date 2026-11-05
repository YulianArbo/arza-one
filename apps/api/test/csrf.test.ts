import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

// Protección contra peticiones falsificadas (numeral 13.1, paso 5). Las pruebas con sesión están
// en test/int/iam: necesitan la base de datos.

let app: NestExpressApplication;
const BODY = { name: 'Ana', amount: '1500.00' };

beforeAll(async () => {
  app = await createTestApp({ controllers: [SampleController] });
});

afterAll(async () => {
  await app.close();
});

describe('origen de las operaciones que modifican datos', () => {
  it('rechaza una petición que llega desde otro sitio', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/echo')
      .set('Origin', 'https://sitio-ajeno.test')
      .send(BODY);
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('CSRF_INVALID');
  });

  it('acepta una petición desde la propia plataforma', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/echo')
      .set('Origin', 'http://localhost:3000')
      .send(BODY);
    expect(response.status).toBe(201);
  });

  it('las consultas no dependen del origen', async () => {
    const response = await request(app.getHttpServer())
      .get('/version')
      .set('Origin', 'https://sitio-ajeno.test');
    expect(response.status).toBe(200);
  });

  it('la API permite al navegador enviar el código antifalsificación desde la web', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
    expect(response.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('cabeceras entre la web y la API', () => {
  it('deja enviar la versión y la llave de la operación, y leer el nombre de una descarga', async () => {
    const preflight = await request(app.getHttpServer())
      .options('/v1/roles/x')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type,if-match,x-csrf-token');
    expect(preflight.headers['access-control-allow-headers']).toContain('If-Match');
    const send = await request(app.getHttpServer())
      .options('/v1/signature-envelopes/x/actions/send')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,if-match,idempotency-key,x-csrf-token');
    expect(send.headers['access-control-allow-headers']).toContain('Idempotency-Key');
    const response = await request(app.getHttpServer())
      .get('/version')
      .set('Origin', 'http://localhost:3000');
    expect(response.headers['access-control-expose-headers']).toBe(
      'X-Correlation-Id,Content-Disposition',
    );
  });
});

describe('rutas de identidad sin sesión', () => {
  it.each([
    ['get', '/v1/auth/session'],
    ['post', '/v1/auth/logout'],
    ['get', '/v1/me'],
    ['post', '/v1/me/password'],
  ] as const)('%s %s responde 401', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path);
    expect(response.status).toBe(401);
  });

  it('una cookie con formato inválido no llega a la base de datos', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Cookie', '__Host-arza_session=corta');
    expect(response.status).toBe(401);
  });
});
