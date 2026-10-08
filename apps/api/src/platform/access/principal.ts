import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Persona con sesión válida que hace la petición (numeral 13.1, paso 4). */
export interface Principal {
  readonly userId: string;
  readonly tenantId: string;
  readonly sessionId: string;
  /** Código antifalsificación que la petición debe traer en X-CSRF-Token (paso 5). */
  readonly csrfToken: string;
}

/** Valida la sesión de la petición. Lo implementa el módulo de identidad (M01). */
export interface Authenticator {
  authenticate(request: Request): Promise<Principal | null>;
}

export const AUTHENTICATOR = Symbol('AUTHENTICATOR');

const principals = new WeakMap<Request, Principal>();

export function attachPrincipal(request: Request, principal: Principal): void {
  principals.set(request, principal);
}

export function principalOf(request: Request): Principal | undefined {
  return principals.get(request);
}

/** Parámetro de controlador con la persona autenticada. Solo en rutas @Authenticated(). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const principal = principalOf(context.switchToHttp().getRequest<Request>());
    if (principal === undefined) {
      throw new Error('La ruta usa CurrentPrincipal sin declarar @Authenticated().');
    }
    return principal;
  },
);
