import { HttpStatus } from '@nestjs/common';
import { FILE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de los archivos (B14): claros, en español y con trato de usted.

export function fileNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, FILE_ERROR_CODES.notFound, 'El archivo no existe.');
}

export function linkInvalid(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    FILE_ERROR_CODES.linkInvalid,
    'El enlace no es válido, ya se usó o venció. Pida uno nuevo.',
  );
}

export function fileNotAvailable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    FILE_ERROR_CODES.notAvailable,
    'El archivo todavía se está analizando o fue rechazado; no se puede descargar.',
  );
}

export function uploadTypeMismatch(): AppError {
  return new AppError(
    HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    FILE_ERROR_CODES.typeNotAllowed,
    'El tipo del archivo enviado no es el que se declaró al pedir el enlace.',
  );
}

export function uploadSizeMismatch(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FILE_ERROR_CODES.sizeMismatch,
    'El tamaño del archivo enviado no es el que se declaró al pedir el enlace.',
  );
}
