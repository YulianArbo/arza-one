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
import { ACCESS_KEY, RECENT_AUTHENTICATION_KEY, type AccessRule } from './access.decorators.js';
import { AUTHENTICATOR, attachPrincipal, type Authenticator, type Principal } from './principal.js';

/**
 * Cerrado por defecto (numeral 13.1, paso 4): las rutas públicas pasan; las que exigen sesión
 * pasan solo con una sesión válida en iam_sessions (B08) y completa, con el segundo factor (B09);
 * las del segundo paso aceptan también una sesión a medias; las que no declaran nada, nunca. Las
 * acciones de alto riesgo exigen además una confirmación de identidad reciente.
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
    if (rule !== 'authenticated' && rule !== 'signing_in') throw new UnauthorizedException();
    const request = context.switchToHttp().getRequest<Request>();
    const principal = await this.authenticator.authenticate(request);
    if (principal === null) throw new UnauthorizedException();
    if (rule === 'authenticated' && !principal.signInComplete) throw secondFactorRequired();
    attachPrincipal(request, principal);
    const recent = this.reflector.getAllAndOverride<boolean | undefined>(
      RECENT_AUTHENTICATION_KEY,
      targets,
    );
    if (recent === true) requireRecentVerification(principal);
    return true;
  }
}

function requireRecentVerification(principal: Principal): void {
  if (!principal.signInComplete || !principal.recentlyVerified) {
    throw new AppError(
      HttpStatus.FORBIDDEN,
      IAM_ERROR_CODES.reauthenticationRequired,
      'Por seguridad, confirme que es usted antes de continuar.',
    );
  }
}

function secondFactorRequired(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    IAM_ERROR_CODES.secondFactorRequired,
    'Para continuar, complete el inicio de sesión con su segundo factor.',
  );
}
