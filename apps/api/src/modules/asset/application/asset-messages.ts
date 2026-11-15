import { HttpStatus } from '@nestjs/common';
import { ASSET_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de Activos (B34): claros, en español y con trato de usted.

export function recordNotFound(what: string): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    ASSET_ERROR_CODES.recordNotFound,
    `No encontramos ${what}. Actualice la lista e intente de nuevo.`,
  );
}

export function recordInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ASSET_ERROR_CODES.recordInvalid, message);
}

export function statusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, ASSET_ERROR_CODES.statusInvalid, message);
}

export function holderNotReady(name: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ASSET_ERROR_CODES.holderNotReady,
    `Para firmar el comodato, ${name} debe estar vinculado con su persona en Terceros, con su número de documento.`,
  );
}

export function formUnavailable(code: string): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ASSET_ERROR_CODES.formUnavailable,
    `La empresa no tiene publicado el formato ${code}. Publíquelo en Documentos › Formatos antes de asignar activos.`,
  );
}
