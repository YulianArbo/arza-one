import { HttpStatus } from '@nestjs/common';
import { PRIVACY_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes del módulo de privacidad (B17): claros y con trato de usted.

export function noticeNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.noticeNotFound,
    'El texto de privacidad no existe.',
  );
}

export function noticeNotEditable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.noticeNotEditable,
    'Un texto publicado no se puede cambiar. Cree una versión nueva.',
  );
}

export function draftExists(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.draftExists,
    'Ya hay un borrador de este texto. Termine ese borrador o publíquelo antes de crear otro.',
  );
}

export function noticeNotPublished(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.noticeNotPublished,
    'No hay un texto de autorización publicado para este titular. Pida al Oficial de Protección ' +
      'de Datos que lo publique.',
  );
}

export function noticeOutdated(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.noticeOutdated,
    'El texto de autorización cambió mientras usted llenaba el formulario. Lea el texto vigente ' +
      'y vuelva a marcar la casilla.',
  );
}

export function purposeInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.purposeInvalid,
    'Elija solo finalidades activas del catálogo; en una autorización, solo las que ofrece el texto.',
  );
}

export function grantDateInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.grantDateInvalid,
    'La fecha de la autorización no puede ser posterior a hoy.',
  );
}

export function consentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.consentNotFound,
    'La autorización no existe.',
  );
}

export function consentRevoked(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PRIVACY_ERROR_CODES.consentRevoked,
    'Esta autorización ya estaba revocada.',
  );
}

export function evidenceInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.evidenceInvalid,
    'Solo puede usar como soporte un archivo que usted subió y que ya pasó la revisión del antivirus.',
  );
}

export function activityNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.activityNotFound,
    'La actividad de tratamiento no existe.',
  );
}

export function processorNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    PRIVACY_ERROR_CODES.processorNotFound,
    'El encargado no existe.',
  );
}

export function processorInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PRIVACY_ERROR_CODES.processorInvalid,
    'El encargado debe ser una organización registrada en Terceros; en una actividad, solo ' +
      'encargados registrados.',
  );
}
