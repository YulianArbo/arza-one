import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ACCESS_KEY, type AccessRule } from './access.decorators.js';

/**
 * Cerrado por defecto (numeral 13.1, paso 4): solo pasan las rutas declaradas públicas.
 * Las sesiones se validan desde B08; hasta entonces toda ruta no pública responde 401.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule === 'public') return true;
    throw new UnauthorizedException();
  }
}
