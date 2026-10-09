import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema } from '@arza/contracts';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildAbility, type PermissionGrant } from '../src/platform/access/ability.js';
import type { Authorizer } from '../src/platform/access/authorizer.js';
import type { Authenticator, Principal } from '../src/platform/access/principal.js';
import { SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

// Paso 8 de la cadena de petición (numeral 13.1) con sesiones y permisos simulados. Las pruebas
// con roles reales en PostgreSQL están en test/int/iam.

function principal(userId: string, recentlyVerified = true): Principal {
  return {
    userId,
    tenantId: '01999a00-0000-7000-8000-0000000000d1',
    sessionId: `01999a00-0000-7000-8000-${userId.slice(-12)}`,
    csrfToken: 'codigo-antifalsificacion-de-prueba',
    signInComplete: true,
    recentlyVerified,
  };
}

const ADMIN = principal('01999a00-0000-7000-8000-00000000a001');
const STALE_ADMIN = principal('01999a00-0000-7000-8000-00000000a002', false);
const WORKER = principal('01999a00-0000-7000-8000-00000000a003');
const NOBODY = principal('01999a00-0000-7000-8000-00000000a004');

const SESSIONS: Readonly<Record<string, Principal | undefined>> = {
  'sesion=admin': ADMIN,
  'sesion=admin-antigua': STALE_ADMIN,
  'sesion=colaborador': WORKER,
  'sesion=sin-roles': NOBODY,
};

const ADMIN_GRANTS: PermissionGrant[] = [
  { code: 'iam.user.read', ownField: null },
  { code: 'iam.role.assign', ownField: null },
  { code: 'iam.delegation.manage', ownField: null },
];

const GRANTS: Readonly<Record<string, readonly PermissionGrant[]>> = {
  [ADMIN.userId]: ADMIN_GRANTS,
  [STALE_ADMIN.userId]: ADMIN_GRANTS,
  [WORKER.userId]: [{ code: 'iam.delegation.manage', ownField: 'from_user_id' }],
};

const authenticator: Authenticator = {
  authenticate: (incoming: Request) =>
    Promise.resolve(SESSIONS[incoming.headers.cookie ?? ''] ?? null),
};

const authorizer: Authorizer = {
  abilityFor: (who) => Promise.resolve(buildAbility(GRANTS[who.userId] ?? [], who.userId)),
};

let app: NestExpressApplication;

beforeAll(async () => {
  app = await createTestApp({ controllers: [SampleController], authenticator, authorizer });
});

afterAll(async () => {
  await app.close();
});

function get(path: string, cookie: string): request.Test {
  return request(app.getHttpServer()).get(path).set('Cookie', cookie);
}

function post(path: string, cookie: string): request.Test {
  return request(app.getHttpServer())
    .post(path)
    .set('Cookie', cookie)
    .set('X-CSRF-Token', 'codigo-antifalsificacion-de-prueba')
    .send({});
}

describe('autorización por rol (paso 8)', () => {
  it('con el permiso, la ruta responde', async () => {
    const response = await get('/test/users', 'sesion=admin');
    expect(response.status).toBe(200);
    expect(response.text).toBe('lista de usuarios');
  });

  it('sin el permiso responde 403 sin revelar nada', async () => {
    const response = await get('/test/users', 'sesion=sin-roles');
    expect(response.status).toBe(403);
    const { error } = errorResponseSchema.parse(response.body);
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(response.text).not.toContain('lista de usuarios');
    expect(error.message).not.toContain('iam.user.read');
  });

  it('una sesión de mi propia cuenta no necesita permisos del catálogo', async () => {
    const response = await get('/test/whoami', 'sesion=sin-roles');
    expect(response.status).toBe(200);
  });

  it('la protección CSRF va antes que la consulta de permisos', async () => {
    const response = await request(app.getHttpServer())
      .post('/test/assign')
      .set('Cookie', 'sesion=admin')
      .send({});
    expect(response.status).toBe(403);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('CSRF_INVALID');
  });
});

describe('permiso y confirmación de identidad', () => {
  it('sin el permiso no se pide confirmar la identidad: se niega de una vez', async () => {
    const response = await post('/test/assign', 'sesion=colaborador');
    expect(errorResponseSchema.parse(response.body).error.code).toBe('PERMISSION_DENIED');
  });

  it('con el permiso pero sin confirmación reciente, pide confirmar la identidad', async () => {
    const response = await post('/test/assign', 'sesion=admin-antigua');
    expect(errorResponseSchema.parse(response.body).error.code).toBe('REAUTHENTICATION_REQUIRED');
  });

  it('con el permiso y la confirmación reciente, la acción se ejecuta', async () => {
    const response = await post('/test/assign', 'sesion=admin');
    expect(response.status).toBe(201);
  });
});

describe('autorización por registro (ABAC)', () => {
  it('«solo lo propio» pasa la ruta pero solo vale sobre sus propios registros', async () => {
    const own = await get(`/test/delegations/${WORKER.userId}`, 'sesion=colaborador');
    expect(own.body).toEqual({ allowed: true });
    const other = await get(`/test/delegations/${ADMIN.userId}`, 'sesion=colaborador');
    expect(other.body).toEqual({ allowed: false });
  });

  it('quien tiene el permiso completo actúa sobre cualquier registro', async () => {
    const response = await get(`/test/delegations/${WORKER.userId}`, 'sesion=admin');
    expect(response.body).toEqual({ allowed: true });
  });

  it('usar los permisos en una ruta sin @RequirePermission es un error de programación', async () => {
    const response = await get('/test/misused-ability', 'sesion=admin');
    expect(response.status).toBe(500);
  });
});
