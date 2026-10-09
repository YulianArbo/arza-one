import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IAM_ERROR_CODES, type PermissionCode } from '@arza/contracts';
import type { Request } from 'express';

import { AppError } from '../errors/app-error.js';
import { hasPermission } from './ability.js';
import {
  ACCESS_KEY,
  PERMISSION_KEY,
  RECENT_AUTHENTICATION_KEY,
  type AccessRule,
} from './access.decorators.js';
import { AUTHORIZER, attachAbility, type Authorizer } from './authorizer.js';
import { permissionDenied } from './permission-denied.js';
import { principalOf, type Principal } from './principal.js';

/**
 * Autorización (numeral 13.1, paso 8): la ruta con @RequirePermission() exige ese permiso del
 * anexo G, calculado en cada petición con los roles vigentes de la persona; sin él responde 403.
 * Luego, las acciones de alto riesgo exigen una confirmación de identidad reciente (B09). Va
 * después de la protección CSRF, así una petición falsificada no llega a consultar permisos.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHORIZER) private readonly authorizer: Authorizer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<Request>();
    const principal = principalOf(request);
    if (principal === undefined) return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, targets);
    if (rule === 'permission') {
      const code = this.reflector.getAllAndOverride<PermissionCode>(PERMISSION_KEY, targets);
      const ability = await this.authorizer.abilityFor(principal);
      if (!hasPermission(ability, code)) throw permissionDenied();
      attachAbility(request, ability);
    }
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
