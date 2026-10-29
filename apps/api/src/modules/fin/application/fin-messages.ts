import { HttpStatus } from '@nestjs/common';
import { FINANCE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { ValidFromProblem } from '../../core/index.js';

// Mensajes de los parámetros tributarios (B23): claros, en español y con trato de usted.

const VALID_FROM_MESSAGES: Readonly<Record<ValidFromProblem, string>> = {
  in_past: 'La tarifa nueva debe empezar hoy o más adelante: el pasado no se reescribe.',
  not_after_latest:
    'La tarifa nueva debe empezar después de la última vigencia registrada. Elija una fecha posterior.',
};

export function taxParameterUnknown(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    FINANCE_ERROR_CODES.taxParameterUnknown,
    'Ese impuesto no está registrado en los parámetros tributarios.',
  );
}

export function taxLabelRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.taxParameterUnknown,
    'Es un impuesto nuevo: escriba su nombre, por ejemplo «IVA general».',
  );
}

export function taxValidFromInvalid(problem: ValidFromProblem): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    FINANCE_ERROR_CODES.taxValidFromInvalid,
    VALID_FROM_MESSAGES[problem],
  );
}
