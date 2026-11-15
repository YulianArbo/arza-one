import { HttpStatus } from '@nestjs/common';
import { PURCHASE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de Compras (B33): claros, en español y con trato de usted.

export function recordNotFound(what: string): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PURCHASE_ERROR_CODES.recordNotFound,
    `No encontramos ${what}. Actualice la lista e intente de nuevo.`,
  );
}

export function recordInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PURCHASE_ERROR_CODES.recordInvalid, message);
}

export function statusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, PURCHASE_ERROR_CODES.statusInvalid, message);
}

export function segregationRequired(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, PURCHASE_ERROR_CODES.segregationRequired, message);
}

export function quotesMissing(required: number, found: number): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PURCHASE_ERROR_CODES.quotesMissing,
    `Por su valor, esta compra exige ${String(required)} cotizaciones y tiene ${String(found)}. Agregue las que faltan antes de elegir.`,
  );
}

export function supplierNotVerified(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PURCHASE_ERROR_CODES.supplierNotVerified,
    'El proveedor no tiene conocimiento del tercero vigente. Actualícelo en Terceros antes de emitir la orden.',
  );
}

export function approvalLevelRequired(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    PURCHASE_ERROR_CODES.approvalLevelRequired,
    'Por su valor, esta compra la aprueba la Dirección.',
  );
}

export function tiersMissing(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PURCHASE_ERROR_CODES.tiersMissing,
    'La empresa no tiene topes de aprobación de compras vigentes. Defínalos en Administración › Parámetros.',
  );
}

export function supportFileInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PURCHASE_ERROR_CODES.supportFileInvalid,
    'El archivo debe estar disponible y haberlo cargado usted.',
  );
}
