import { HttpStatus } from '@nestjs/common';
import { ACCESS_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../errors/app-error.js';

/** Mensaje que no revela qué permiso falta ni qué hay detrás (numeral 16.5). */
export function permissionDenied(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    ACCESS_ERROR_CODES.permissionDenied,
    'No tiene permiso para esta acción. Si lo necesita para su trabajo, solicítelo al administrador de la plataforma.',
  );
}
