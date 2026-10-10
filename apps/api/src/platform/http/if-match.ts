import { HttpStatus } from '@nestjs/common';
import { PLATFORM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../errors/app-error.js';

// Bloqueo optimista (numeral 14.1): quien edita envía la versión que vio en la cabecera If-Match y
// la escritura solo procede si nadie cambió el registro entretanto.

function versionRequired(): AppError {
  return new AppError(
    HttpStatus.BAD_REQUEST,
    PLATFORM_ERROR_CODES.versionRequired,
    'Falta la versión del registro (cabecera If-Match).',
  );
}

export function versionConflict(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PLATFORM_ERROR_CODES.versionConflict,
    'Otra persona cambió este registro mientras usted lo editaba. Recargue para ver los cambios.',
  );
}

/** Versión del registro en la cabecera If-Match: «3» o «"3"». */
export function versionFromIfMatch(header: string | undefined): number {
  const value = header
    ?.trim()
    .replace(/^W\//, '')
    .replace(/^"(.*)"$/, '$1');
  if (value === undefined || !/^[1-9]\d{0,8}$/.test(value)) throw versionRequired();
  return Number(value);
}
