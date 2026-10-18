import { HttpStatus } from '@nestjs/common';
import { DOC_ERROR_CODES } from '@arza/contracts';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de los formatos digitales, sus registros y las plantillas de salida (B20).

export function formTemplateNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.formTemplateNotFound,
    'El formato no existe o no está disponible.',
  );
}

export function formTemplateNotEditable(reason: string): AppError {
  return new AppError(HttpStatus.CONFLICT, DOC_ERROR_CODES.formTemplateNotEditable, reason);
}

export function formRecordNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.formRecordNotFound,
    'El registro no existe o usted no tiene acceso a él.',
  );
}

export function formRecordNotEditable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.formRecordNotEditable,
    'Solo quien diligencia el registro lo cambia, y solo mientras está en borrador.',
  );
}

export function formEntityInvalid(reason: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, DOC_ERROR_CODES.formDataInvalid, reason);
}

export function outputTemplateNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.outputTemplateNotFound,
    'La plantilla de salida no existe.',
  );
}

export function outputTemplateNotEditable(reason: string): AppError {
  return new AppError(HttpStatus.CONFLICT, DOC_ERROR_CODES.outputTemplateNotEditable, reason);
}

export function outputTemplateInvalid(detail: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.outputTemplateInvalid,
    detail,
  );
}

export function checklistRequired(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.checklistRequired,
    'Antes de aprobar la revisión, diligencie y envíe la Lista de Verificación Documental (FT-SGC-002) de esta versión.',
  );
}

/** Datos que no cumplen los campos del formato: 422 con cada campo señalado bajo «data». */
export function formDataInvalid(error: z.ZodError): ZodValidationException {
  const issues = error.issues.map((issue) => ({ ...issue, path: ['data', ...issue.path] }));
  return new ZodValidationException(new z.ZodError(issues));
}
