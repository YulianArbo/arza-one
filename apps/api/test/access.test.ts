import type { NestExpressApplication } from '@nestjs/platform-express';
import { errorResponseSchema, isPermissionCode } from '@arza/contracts';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { routeDeclarations, type RouteDeclaration } from './support/route-inventory.js';
import { SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const DECLARATIONS = new Set(['public', 'signing_in', 'own_account', 'permission', 'record']);

/** Rutas que no declaran cómo se accede a ellas. */
function undeclared(routes: readonly RouteDeclaration[]): string[] {
  return routes.filter((route) => !DECLARATIONS.has(String(route.access))).map((r) => r.route);
}

describe('permiso denegado: la API está cerrada por defecto', () => {
  it('una ruta que exige sesión responde 401 si no hay sesión', async () => {
    app = await createTestApp({ controllers: [SampleController] });
    const response = await request(app.getHttpServer()).get('/test/private');
    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    expect(response.text).not.toContain('nunca debe llegar aquí');
  });

  it('una ruta que no declara su acceso también responde 401', async () => {
    app = await createTestApp({ controllers: [SampleController] });
    const response = await request(app.getHttpServer()).get('/test/undeclared');
    expect(response.status).toBe(401);
  });

  it('una ruta con permiso responde 401 si no hay sesión', async () => {
    app = await createTestApp({ controllers: [SampleController] });
    const response = await request(app.getHttpServer()).get('/test/users');
    expect(response.status).toBe(401);
  });

  it('detecta las rutas que no declaran su acceso', async () => {
    app = await createTestApp({ controllers: [SampleController] });
    expect(undeclared(routeDeclarations(app))).toEqual(['SampleController.undeclared']);
  });
});

// Criterio de aceptación de B10: cada punto de la API declara su permiso.
describe('todas las rutas reales de la API declaran su acceso', () => {
  let routes: RouteDeclaration[] = [];

  beforeAll(async () => {
    const real = await createTestApp();
    routes = routeDeclarations(real);
    await real.close();
  });

  afterAll(() => {
    routes = [];
  });

  it('ninguna ruta queda sin declarar', () => {
    expect(routes.length).toBeGreaterThan(30);
    expect(undeclared(routes)).toEqual([]);
  });

  it('las que exigen permiso nombran uno del catálogo del anexo G', () => {
    const withPermission = routes.filter((route) => route.access === 'permission');
    expect(withPermission.length).toBeGreaterThan(10);
    for (const route of withPermission) {
      expect(isPermissionCode(String(route.permission)), route.route).toBe(true);
    }
  });

  it('«mi propia cuenta» solo se usa en /v1/me y /v1/auth', () => {
    const own = routes.filter((route) => route.access === 'own_account');
    for (const route of own) {
      expect(route.path, route.route).toMatch(/^\/v1\/(me|auth)(\/|$)/);
    }
  });

  it('las rutas públicas son solo las de acceso, las de estado y los enlaces de archivos', () => {
    const open = routes.filter((route) => route.access === 'public').map((route) => route.path);
    for (const path of open) {
      // Enlaces temporales de archivos (B14): la llave del enlace es la autorización.
      // El enlace de la cotización (B23, decisión 8) y la página de firma (B25): la llave va en el
      // cuerpo de la petición. La verificación pública (B25, numeral 19.3) no revela el contenido.
      // PQRSF y encuesta (B29): radicar, consultar con radicado y correo, y la encuesta con su llave.
      expect(path).toMatch(
        /^\/(health|version|v1\/auth\/(login|password\/\w+|invitation\/accept)|v1\/files\/(uploads|downloads)\/:token|v1\/public\/quotes\/(view|pdf|accept|reject)|v1\/public\/signatures\/(open|code|verify-code|document|sign|reject)|v1\/public\/verifications|v1\/public\/pqrsf(\/status)?|v1\/public\/surveys\/(view|answer))$/,
      );
    }
  });
});

// B16: los comentarios y adjuntos dejan el permiso al módulo dueño del registro.
describe('las rutas «según el registro»', () => {
  let routes: RouteDeclaration[] = [];

  beforeAll(async () => {
    const real = await createTestApp();
    routes = routeDeclarations(real);
    await real.close();
  });

  afterAll(() => {
    routes = [];
  });

  it('«según el registro» solo se usa en los comentarios y adjuntos', () => {
    const record = routes.filter((route) => route.access === 'record');
    expect(record.length).toBeGreaterThan(0);
    for (const route of record) {
      expect(route.path, route.route).toMatch(/^\/v1\/(comments|attachments)(\/|$)/);
    }
  });
});
