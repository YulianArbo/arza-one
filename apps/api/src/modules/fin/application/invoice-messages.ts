import { HttpStatus } from '@nestjs/common';
import { FINANCE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

export function invoiceNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    FINANCE_ERROR_CODES.invoiceNotFound,
    'No encontramos esa factura. Actualice la lista e intente de nuevo.',
  );
}

export function milestoneNotBillable(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.milestoneNotBillable,
    'El hito no está listo para facturar o ya tiene una solicitud de factura.',
  );
}

export function invoiceStatusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, FINANCE_ERROR_CODES.invoiceStatusInvalid, message);
}

export function fiscalFileInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.fiscalFileInvalid,
    'El archivo debe estar disponible y haberlo cargado usted.',
  );
}

export function creditNoteInvalid(message: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.creditNoteInvalid,
    message,
  );
}

export function paymentInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, FINANCE_ERROR_CODES.paymentInvalid, message);
}
