import { HttpStatus } from '@nestjs/common';
import { DOC_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de la Solicitud de Acción Documental y de la constancia de lectura (B19).

export function changeRequestNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.changeRequestNotFound,
    'La solicitud de acción documental no existe.',
  );
}

export function changeRequestRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.changeRequestRequired,
    'Un cambio en un documento del SGC exige una Solicitud de Acción Documental aprobada.',
  );
}

export function changeRequestInvalid(reason: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.changeRequestInvalid,
    `No se puede usar esa solicitud: ${reason}`,
  );
}

export function changeRequestOpen(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.changeRequestInvalid,
    'Ya hay una solicitud en curso para este documento. Espere a que se decida y se ejecute.',
  );
}

export function selfDecision(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    DOC_ERROR_CODES.selfDecision,
    'Quien pide un cambio documental no puede decidirlo. Pida a otra persona de Calidad.',
  );
}

export function notAcknowledgeable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.notAcknowledgeable,
    'Solo se confirma la lectura de un documento vigente.',
  );
}
