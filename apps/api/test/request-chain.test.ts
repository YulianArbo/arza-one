import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { INTERNAL_DETAIL, SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

const UUID_V7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp({ controllers: [SampleController] });
});

afterAll(async () => {
  await app.close();
});

describe('identificador de correlación', () => {
  it('asigna uno nuevo a cada petición', async () => {
    const response = await request(app.getHttpServer()).get('/version');
    expect(response.headers['x-correlation-id']).toMatch(UUID_V7);
  });

  it('propaga el que llega en la petición', async () => {
    const id = '0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10';
    const response = await request(app.getHttpServer()).get('/version').set('X-Correlation-Id', id);
    expect(response.headers['x-correlation-id']).toBe(id);
  });
});

describe('cabeceras de seguridad (numeral 15.6)', () => {
  it('las incluye en cada respuesta', async () => {
    const { headers } = await request(app.getHttpServer()).get('/version');
    expect(headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
    expect(headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(headers['x-powered-by']).toBeUndefined();
    // B43: ningún sitio ajeno comparte ventana ni incrusta respuestas de la API.
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  it('las incluye también en los errores', async () => {
    const { status, headers } = await request(app.getHttpServer()).get('/no-existe');
    expect(status).toBe(404);
    expect(headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(headers['cache-control']).toBe('no-store');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('formato único de error (numeral 14.2)', () => {
  it('un error inesperado devuelve 500 sin traza ni detalle interno', async () => {
    const response = await request(app.getHttpServer()).get('/test/boom');
    expect(response.status).toBe(500);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.correlation_id).toBe(response.headers['x-correlation-id']);
    expect(body.error.message).toContain(body.error.correlation_id);
    expect(response.text).not.toContain(INTERNAL_DETAIL);
    expect(response.text).not.toMatch(/at .+\.(ts|js):\d+/);
  });

  it('una ruta inexistente devuelve 404 con el formato único', async () => {
    const response = await request(app.getHttpServer()).get('/no-existe');
    expect(response.status).toBe(404);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('datos inválidos devuelven 422 con el detalle de cada campo', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/echo')
      .send({ name: 'A', amount: 1500 });
    expect(response.status).toBe(422);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual([
      { field: 'name', issue: 'too_small' },
      { field: 'amount', issue: 'invalid_type' },
    ]);
  });

  it('datos válidos pasan la validación', async () => {
    const valid = { name: 'Servicio', amount: '1500000.00' };
    const response = await request(app.getHttpServer()).post('/test/echo').send(valid);
    expect(response.status).toBe(201);
    expect(response.body).toEqual(valid);
  });
});

describe('errores del cuerpo de la petición', () => {
  it('un JSON mal formado devuelve 400 con el formato único', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(response.status).toBe(400);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST');
  });

  it('un cuerpo demasiado grande se rechaza con el formato único', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/echo')
      .send({ name: 'x'.repeat(1_100_000), amount: '1.00' });
    expect(response.status).toBe(413);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
