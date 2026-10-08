import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ACCESS_KEY, type AccessRule } from './access.decorators.js';
import { AUTHENTICATOR, attachPrincipal, type Authenticator } from './principal.js';

/**
 * Cerrado por defecto (numeral 13.1, paso 4): las rutas públicas pasan; las que exigen sesión
 * pasan solo con una sesión válida en iam_sessions (B08); las que no declaran nada, nunca.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHENTICATOR) private readonly authenticator: Authenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule === 'public') return true;
    if (rule !== 'authenticated') throw new UnauthorizedException();
    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.authenticator.authenticate(request);
    if (principal === null) throw new UnauthorizedException();
    attachPrincipal(request, principal);
    return true;
  }
}
