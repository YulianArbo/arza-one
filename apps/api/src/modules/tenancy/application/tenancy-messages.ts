import { HttpStatus } from '@nestjs/common';
import { IAM_ERROR_CODES, TENANCY_ERROR_CODES as CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import { raisedByDatabase } from '../../../platform/errors/database-raised.js';

// Mensajes de multiempresa para la persona (numeral 16.6: claros, en español, trato de usted).

export function operatorOnly(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    CODES.operatorOnly,
    'Solo la empresa que opera ARZA ONE administra las empresas de la plataforma.',
  );
}

export function operatorProtected(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CODES.operatorProtected,
    'La empresa que opera ARZA ONE no se puede suspender ni eliminar.',
  );
}

export function tenantNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, CODES.tenantNotFound, 'La empresa no existe.');
}

export function statusInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, CODES.statusInvalid, message);
}

export function exportRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CODES.exportRequired,
    'Antes de pedir la eliminación, la Dirección de la empresa debe generar su exportación completa (de los últimos 30 días).',
  );
}

export function taxIdMismatch(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CODES.taxIdMismatch,
    'El NIT escrito no coincide con el de la empresa. Escríbalo igual para confirmar.',
  );
}

export function taxIdTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    'CORE_TAX_ID_TAKEN',
    'Ya hay una empresa con ese NIT en la plataforma.',
  );
}

export function adminEmailTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    IAM_ERROR_CODES.emailTaken,
    'Ese correo ya tiene una cuenta en ARZA ONE. Use otro correo para el administrador.',
  );
}

export function exportNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, CODES.exportNotFound, 'La exportación no existe.');
}

export function exportNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CODES.exportNotReady,
    'La exportación no está lista para descargar o ya venció.',
  );
}

export function exportInProgressError(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CODES.exportInProgress,
    'Ya hay una exportación en curso. Espere a que termine.',
  );
}

/** Traduce el error que lanzó una función de la plataforma en la base de datos. */
export function platformError(error: unknown): unknown {
  switch (raisedByDatabase(error)) {
    case CODES.operatorOnly:
      return operatorOnly();
    case CODES.operatorProtected:
      return operatorProtected();
    case CODES.tenantNotFound:
      return tenantNotFound();
    case CODES.exportRequired:
      return exportRequired();
    case CODES.statusInvalid:
      return statusInvalid('La empresa no está en un estado que permita ese cambio.');
    default:
      return error;
  }
}
