import { HttpStatus } from '@nestjs/common';
import { FINANCE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes del B32 (presupuesto, gastos, caja menor, conciliación, certificación, cierre y
// exportación): claros, en español y con trato de usted.

export function recordNotFound(what: string): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    FINANCE_ERROR_CODES.recordNotFound,
    `No encontramos ${what}. Actualice la lista e intente de nuevo.`,
  );
}

export function recordInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, FINANCE_ERROR_CODES.recordInvalid, message);
}

export function statusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, FINANCE_ERROR_CODES.statusInvalid, message);
}

export function segregationRequired(what: string): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    FINANCE_ERROR_CODES.segregationRequired,
    `${what} lo aprueba una persona distinta de quien lo registró.`,
  );
}

export function periodClosed(period: string): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    FINANCE_ERROR_CODES.periodClosed,
    `El mes ${period} está cerrado y no admite cambios. Registre la corrección en un mes abierto.`,
  );
}

export function periodNotClosable(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, FINANCE_ERROR_CODES.periodNotClosable, message);
}

export function exportTooLarge(max: number): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.exportTooLarge,
    `El mes tiene más de ${String(max)} movimientos; esta exportación no puede generarse en el acto.`,
  );
}

export function supportFileInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.fiscalFileInvalid,
    'El soporte debe estar disponible y haberlo cargado usted.',
  );
}
