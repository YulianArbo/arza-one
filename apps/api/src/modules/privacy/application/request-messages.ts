import { HttpStatus } from '@nestjs/common';
import { PRIVACY_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de las solicitudes de titulares, la entrega y supresión de datos y los incidentes (B42).

export function requestNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.requestNotFound,
    'La solicitud no existe.',
  );
}

export function requestStepInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, PRIVACY_ERROR_CODES.requestStepInvalid, message);
}

export function requestNotVerified(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.requestNotVerified,
    'Primero verifique la identidad del titular y relacione la solicitud con su ficha en Terceros.',
  );
}

export function requestUnavailable(): AppError {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    PRIVACY_ERROR_CODES.requestUnavailable,
    'En este momento no podemos recibir solicitudes por este medio. Escríbanos al correo de ' +
      'protección de datos que aparece en la política de tratamiento.',
  );
}

export function requestDateInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.requestStepInvalid,
    'La fecha no puede ser posterior a hoy ni anterior a la recepción de la solicitud.',
  );
}

export function accountActive(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.accountActive,
    'El titular tiene una cuenta activa en el portal. Desactívela antes de suprimir sus datos.',
  );
}

export function exportNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.exportNotReady,
    'El archivo con los datos todavía se está preparando. Intente de nuevo en unos minutos.',
  );
}

export function incidentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.incidentNotFound,
    'El incidente no existe.',
  );
}

export function incidentStepInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, PRIVACY_ERROR_CODES.incidentStepInvalid, message);
}

export function incidentDateInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.incidentStepInvalid,
    'La fecha no puede ser posterior a hoy ni anterior a la detección del incidente.',
  );
}
