import {
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IAM_ERROR_CODES } from '@arza/contracts';
import type { Request } from 'express';

import { AppError } from '../errors/app-error.js';
import { ACCESS_KEY, type AccessRule } from './access.decorators.js';
import { AUTHENTICATOR, attachPrincipal, type Authenticator } from './principal.js';

const SESSION_RULES: ReadonlySet<AccessRule> = new Set([
  'signing_in',
  'own_account',
  'permission',
  'record',
]);

/**
 * Autenticación, cerrada por defecto (numeral 13.1, paso 4): las rutas públicas pasan; las demás
 * pasan solo con una sesión válida en iam_sessions (B08) y completa, con el segundo factor (B09),
 * salvo las del segundo paso, que aceptan también una sesión a medias; las que no declaran nada,
 * nunca. El permiso de la ruta lo revisa después AuthorizationGuard, tras la protección CSRF.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHENTICATOR) private readonly authenticator: Authenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, targets);
    if (rule === 'public') return true;
    if (rule === undefined || !SESSION_RULES.has(rule)) throw new UnauthorizedException();
    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.authenticator.authenticate(request);
    if (principal === null) throw new UnauthorizedException();
    if (rule !== 'signing_in' && !principal.signInComplete) throw secondFactorRequired();
    attachPrincipal(request, principal);
    return true;
  }
}

function secondFactorRequired(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    IAM_ERROR_CODES.secondFactorRequired,
    'Para continuar, complete el inicio de sesión con su segundo factor.',
  );
}
