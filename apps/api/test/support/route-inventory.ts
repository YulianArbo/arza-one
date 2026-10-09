import { PATH_METADATA } from '@nestjs/common/constants.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';

import { ACCESS_KEY, PERMISSION_KEY } from '../../src/platform/access/access.decorators.js';

/** Una ruta de la API con lo que declara sobre su acceso (B10). */
export interface RouteDeclaration {
  readonly route: string;
  readonly path: string;
  readonly access: unknown;
  readonly permission: unknown;
}

function joinPath(base: unknown, path: unknown): string {
  const parts = [base, path].filter((part): part is string => typeof part === 'string');
  return `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

/** Recorre todos los controladores registrados y lee lo que declara cada ruta. */
export function routeDeclarations(target: NestExpressApplication): RouteDeclaration[] {
  const reflector = target.get(Reflector);
  const scanner = new MetadataScanner();
  const routes: RouteDeclaration[] = [];
  for (const wrapper of new DiscoveryService(target.get(ModulesContainer)).getControllers()) {
    const controller = wrapper.metatype as (new () => object) | null;
    if (controller === null) continue;
    const prototype = controller.prototype as Record<string, unknown>;
    const base: unknown = Reflect.getMetadata(PATH_METADATA, controller);
    for (const method of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[method] as () => unknown;
      const targets = [handler, controller];
      routes.push({
        route: `${controller.name}.${method}`,
        path: joinPath(base, Reflect.getMetadata(PATH_METADATA, handler)),
        access: reflector.getAllAndOverride<unknown>(ACCESS_KEY, targets),
        permission: reflector.getAllAndOverride<unknown>(PERMISSION_KEY, targets),
      });
    }
  }
  return routes;
}
