import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Authenticator, Principal } from '../src/platform/access/principal.js';
import { SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

// Pasos 4 y 5 de la cadena de petición (numeral 13.1) con una validación de sesiones simulada.
// Las pruebas con sesiones reales en PostgreSQL están en test/int/iam.

const PRINCIPAL: Principal = {
  userId: '01999a00-0000-7000-8000-00000000a001',
  tenantId: '01999a00-0000-7000-8000-0000000000d1',
  sessionId: '01999a00-0000-7000-8000-00000000b001',
  csrfToken: 'codigo-antifalsificacion-de-prueba',
  signInComplete: true,
  recentlyVerified: true,
  termsPending: false,
};

/** Solo verificó la contraseña: le falta el segundo factor (B09). */
const PENDING: Principal = { ...PRINCIPAL, signInComplete: false, recentlyVerified: false };
/** Sesión completa, pero confirmó su identidad hace más de 30 minutos. */
const NOT_RECENT: Principal = { ...PRINCIPAL, recentlyVerified: false };
/** Al ingresar faltaba aceptar los términos de la plataforma vigentes (B41). */
const TERMS: Principal = { ...PRINCIPAL, termsPending: true };

const SESSIONS: Readonly<Record<string, Principal | undefined>> = {
  'sesion=valida': PRINCIPAL,
  'sesion=a-medias': PENDING,
  'sesion=antigua': NOT_RECENT,
  'sesion=terminos': TERMS,
};

/** Acepta solo las cookies de SESSIONS. */
const fakeAuthenticator: Authenticator = {
  authenticate: (incoming: Request) =>
    Promise.resolve(SESSIONS[incoming.headers.cookie ?? ''] ?? null),
};

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp({ controllers: [SampleController], authenticator: fakeAuthenticator });
});

afterAll(async () => {
  await app.close();
});

describe('autenticación (paso 4)', () => {
  it('con sesión válida, la ruta recibe a la persona y los datos de la petición', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/whoami')
      .set('Cookie', 'sesion=valida')
      .set('User-Agent', 'Navegador de prueba')
      .set('X-Forwarded-For', '10.1.2.3');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: PRINCIPAL.userId,
      ip: '10.1.2.3',
      userAgent: 'Navegador de prueba',
    });
  });

  it('sin sesión válida responde 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/whoami')
      .set('Cookie', 'sesion=vencida');
    expect(response.status).toBe(401);
  });

  it('una ruta pública que pide a la persona es un error de programación, nunca un acceso', async () => {
    const response = await request(app.getHttpServer()).get('/test/misused-principal');
    expect(response.status).toBe(500);
  });
});

describe('segundo factor y confirmación de identidad (B09, permiso denegado)', () => {
  function get(path: string, cookie: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookie);
  }

  it('una sesión a la que le falta el segundo factor no entra a ninguna ruta normal', async () => {
    const response = await get('/test/whoami', 'sesion=a-medias');
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('SECOND_FACTOR_REQUIRED');
  });

  it('esa sesión solo atiende las rutas del segundo paso', async () => {
    const pending = await get('/test/signing-in', 'sesion=a-medias');
    expect(pending.status).toBe(200);
    expect(pending.body).toEqual({ signInComplete: false });
    expect((await get('/test/signing-in', 'sesion=valida')).status).toBe(200);
    expect((await get('/test/signing-in', 'sesion=vencida')).status).toBe(401);
  });

  it('una acción de alto riesgo exige confirmar la identidad en los últimos 30 minutos', async () => {
    const stale = await get('/test/high-risk', 'sesion=antigua');
    expect(stale.status).toBe(403);
    expect(errorResponseSchema.parse(stale.body).error.code).toBe('REAUTHENTICATION_REQUIRED');
    expect((await get('/test/high-risk', 'sesion=a-medias')).status).toBe(403);
    expect((await get('/test/high-risk', 'sesion=valida')).status).toBe(200);
  });
});

describe('términos de la plataforma pendientes (B41, decisión 3)', () => {
  function get(path: string, cookie: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookie);
  }

  it('sin aceptarlos no entra a ninguna ruta con permiso', async () => {
    const response = await get('/test/users', 'sesion=terminos');
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('TERMS_PENDING');
  });

  it('sí atiende su cuenta propia, para leerlos y aceptarlos', async () => {
    expect((await get('/test/whoami', 'sesion=terminos')).status).toBe(200);
    expect((await get('/test/signing-in', 'sesion=terminos')).status).toBe(200);
  });
});

describe('código antifalsificación (paso 5)', () => {
  function change(token?: string) {
    const call = request(app.getHttpServer())
      .post('/test/private-change')
      .set('Cookie', 'sesion=valida')
      .set('Origin', 'http://localhost:3000');
    return token === undefined ? call : call.set('X-CSRF-Token', token);
  }

  it('con sesión, una operación que modifica datos sin código se rechaza', async () => {
    const response = await change();
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('CSRF_INVALID');
  });

  it('un código equivocado se rechaza', async () => {
    expect((await change('otro-codigo')).status).toBe(403);
    expect((await change(`${PRINCIPAL.csrfToken}x`)).status).toBe(403);
  });

  it('el código de la sesión deja pasar la operación', async () => {
    const response = await change(PRINCIPAL.csrfToken);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ userId: PRINCIPAL.userId });
  });
});

describe('errores con tiempo de espera', () => {
  it('informan cuántos segundos esperar en Retry-After', async () => {
    const response = await request(app.getHttpServer()).get('/test/slow-down');
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('3');
    expect(errorResponseSchema.parse(response.body).error).toMatchObject({
      code: 'LOGIN_DELAYED',
      message: 'Espere 3 segundos.',
    });
  });
});
