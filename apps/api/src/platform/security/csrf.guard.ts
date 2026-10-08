import { timingSafeEqual } from 'node:crypto';

import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { IAM_ERROR_CODES } from '@arza/contracts';
import type { Request } from 'express';

import { principalOf } from '../access/principal.js';
import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { AppError } from '../errors/app-error.js';
import { allowedOrigins } from './allowed-origins.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-token';

const CSRF_MESSAGE = 'La petición no se pudo verificar. Recargue la página e intente de nuevo.';

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Protección contra peticiones falsificadas (numeral 13.1, paso 5, y 15.5). En toda operación
 * que modifica datos:
 * - si el navegador informa el origen, debe ser uno de los dominios propios (los navegadores
 *   siempre lo envían en estas peticiones);
 * - con sesión, además, la cabecera X-CSRF-Token debe traer el código de esa sesión, que otro
 *   sitio no puede conocer ni enviar.
 * Se ejecuta después de la guarda de acceso, que ya validó la sesión.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly origins: ReadonlySet<string>;

  constructor(@Inject(CONFIG) config: Env) {
    this.origins = new Set(allowedOrigins(config));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const origin = request.headers.origin;
    if (origin !== undefined && !this.origins.has(origin)) throw csrfError();
    const principal = principalOf(request);
    if (principal === undefined) return true;
    const received = request.headers[CSRF_HEADER];
    if (typeof received !== 'string' || !sameSecret(received, principal.csrfToken)) {
      throw csrfError();
    }
    return true;
  }
}

function csrfError(): AppError {
  return new AppError(HttpStatus.FORBIDDEN, IAM_ERROR_CODES.csrfInvalid, CSRF_MESSAGE);
}
