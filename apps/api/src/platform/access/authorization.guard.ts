import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IAM_ERROR_CODES, type PermissionCode } from '@arza/contracts';
import type { Request } from 'express';

import { recordSecurityEvent } from '../audit/audit-recorder.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DatabaseService } from '../database/database.service.js';
import { AppError } from '../errors/app-error.js';
import { requestMetaOf } from '../http/request-meta.js';
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
 * La de @RequireRecordAccess() recibe los permisos y su caso de uso decide (B16).
 * Luego, las acciones de alto riesgo exigen una confirmación de identidad reciente (B09). Va
 * después de la protección CSRF, así una petición falsificada no llega a consultar permisos.
 * Desde B23, cada permiso denegado deja un evento de seguridad (anexo D, M05-H012).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AUTHORIZER) private readonly authorizer: Authorizer,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<Request>();
    const principal = principalOf(request);
    if (principal === undefined) return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, targets);
    if (rule === 'permission' || rule === 'record') {
      const ability = await this.authorizer.abilityFor(principal);
      if (rule === 'permission') {
        const code = this.reflector.getAllAndOverride<PermissionCode>(PERMISSION_KEY, targets);
        if (!hasPermission(ability, code)) {
          await this.recordDenial(principal, request, code);
          throw permissionDenied();
        }
      }
      attachAbility(request, ability);
    }
    const recent = this.reflector.getAllAndOverride<boolean | undefined>(
      RECENT_AUTHENTICATION_KEY,
      targets,
    );
    if (recent === true) requireRecentVerification(principal);
    return true;
  }

  private readonly logger = new Logger('AuthorizationGuard');

  /**
   * Evento de seguridad del permiso denegado: quién, qué permiso, qué ruta y desde qué IP. Si no se
   * puede guardar (la base no responde), se registra en el log y la respuesta sigue siendo 403.
   */
  private async recordDenial(
    principal: Principal,
    request: Request,
    permission: PermissionCode,
  ): Promise<void> {
    try {
      await this.database.withTenant(principal, (tx) =>
        recordSecurityEvent(tx, {
          tenantId: principal.tenantId,
          occurredAt: this.clock.now(),
          type: 'access.permission_denied',
          userId: principal.userId,
          severity: 'low',
          detail: {
            permission,
            method: request.method,
            path: request.path,
          },
          meta: requestMetaOf(request),
        }),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar el evento de permiso denegado (${permission}): ${String(error)}`,
      );
    }
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
