import { HttpStatus } from '@nestjs/common';

import { HR_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

/** Quien ejecuta la operación de vinculación: empresa, usuario, momento y metadatos de la petición. */
export interface HiringActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

export function recordNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    HR_ERROR_CODES.recordNotFound,
    'El colaborador no existe.',
  );
}

export function statusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, HR_ERROR_CODES.statusInvalid, message);
}

export function personNotReady(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, HR_ERROR_CODES.personNotReady, message);
}
