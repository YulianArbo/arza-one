import { HttpStatus } from '@nestjs/common';
import { DOC_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de la tabla de retención y de la disposición final (B21).

export function retentionRuleNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.retentionRuleNotFound,
    'La regla de retención no existe o está inactiva.',
  );
}

export function retentionRuleConflict(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.retentionRuleConflict,
    'Ya hay una regla con ese código, o una regla activa para ese mismo tipo y proceso.',
  );
}

export function dispositionNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.dispositionNotFound,
    'La propuesta de disposición o su documento no existe.',
  );
}

export function dispositionNotEditable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.dispositionNotEditable,
    'Los documentos de una propuesta solo se deciden mientras Calidad la revisa.',
  );
}

export function selfDisposition(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    DOC_ERROR_CODES.selfDisposition,
    'Quien envió la propuesta de disposición no puede aprobarla ni rechazarla.',
  );
}

export function documentDisposed(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.documentDisposed,
    'El documento se eliminó por disposición final: ya no tiene contenido ni se puede cambiar.',
  );
}

export function retentionChanged(codes: readonly string[]): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.dispositionNotEditable,
    `La retención de ${codes.join(', ')} cambió y ya no está vencida o ya no dice eliminar. ` +
      'Rechace la propuesta: el mes siguiente se propone de nuevo con la regla actual.',
  );
}
