import { HttpStatus } from '@nestjs/common';
import { IMAGE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { OwnImageState } from './profile-ports.js';

// Mensajes de la foto de perfil y del logo (B22A); también los usa el módulo de terceros.

function imageInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    IMAGE_ERROR_CODES.invalid,
    'Use una imagen PNG o JPG que usted subió y que ya pasó la revisión del antivirus.',
  );
}

function imageScanning(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    IMAGE_ERROR_CODES.scanning,
    'El antivirus todavía está revisando la imagen. Intente de nuevo en unos segundos.',
  );
}

/** La imagen se puede usar; si no, el error que corresponde a su estado. */
export function assertUsableImage(state: OwnImageState): void {
  if (state === 'scanning') throw imageScanning();
  if (state === 'invalid') throw imageInvalid();
}

export function imageNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, IMAGE_ERROR_CODES.notFound, 'No hay imagen guardada.');
}

export function imageNotAllowed(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, IMAGE_ERROR_CODES.notAllowed, message);
}
