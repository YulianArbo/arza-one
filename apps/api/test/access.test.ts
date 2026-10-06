import type { NestExpressApplication } from '@nestjs/platform-express';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { errorResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { ACCESS_KEY } from '../src/platform/access/access.decorators.js';
import { SampleController } from './support/sample.controller.js';
import { createTestApp } from './support/test-app.js';

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Lista las rutas de la API que no declaran cómo se accede a ellas. */
function undeclaredRoutes(target: NestExpressApplication): string[] {
  const reflector = target.get(Reflector);
  const scanner = new MetadataScanner();
  const undeclared: string[] = [];
  for (const wrapper of new DiscoveryService(target.get(ModulesContainer)).getControllers()) {
    const controller = wrapper.metatype as (new () => object) | null;
    if (controller === null) continue;
    const prototype = controller.prototype as Record<string, unknown>;
    for (const method of scanner.getAllMethodNames(prototype)) {
      const rule = reflector.getAllAndOverride<unknown>(ACCESS_KEY, [
        prototype[method] as () => unknown,
        controller,
      ]);
      if (rule === undefined) undeclared.push(`${controller.name}.${method}`);
    }
  }
  return undeclared;
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

  it('detecta las rutas que no declaran su acceso', async () => {
    app = await createTestApp({ controllers: [SampleController] });
    expect(undeclaredRoutes(app)).toEqual(['SampleController.undeclared']);
  });

  it('todas las rutas reales de la API declaran su acceso', async () => {
    app = await createTestApp();
    expect(undeclaredRoutes(app)).toEqual([]);
  });
});
