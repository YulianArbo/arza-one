import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AppAbility } from './ability.js';
import type { Principal } from './principal.js';

/** Calcula los permisos vigentes de la persona. Lo implementa el módulo de identidad (M01). */
export interface Authorizer {
  abilityFor(principal: Principal): Promise<AppAbility>;
}

export const AUTHORIZER = Symbol('AUTHORIZER');

const abilities = new WeakMap<Request, AppAbility>();

export function attachAbility(request: Request, ability: AppAbility): void {
  abilities.set(request, ability);
}

/**
 * Parámetro de controlador con los permisos de la persona, ya calculados por la guarda. Solo en
 * rutas con @RequirePermission(), para revisar el registro concreto o filtrar la respuesta.
 */
export const CurrentAbility = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const ability = abilities.get(context.switchToHttp().getRequest<Request>());
  if (ability === undefined) {
    throw new Error('La ruta usa CurrentAbility sin declarar @RequirePermission().');
  }
  return ability;
});
