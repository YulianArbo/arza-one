import { HttpStatus } from '@nestjs/common';
import { NTF_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de los avisos, los comentarios y los adjuntos (B16): claros y con trato de usted.

export function notificationNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    NTF_ERROR_CODES.notificationNotFound,
    'El aviso no existe.',
  );
}

export function templateNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    NTF_ERROR_CODES.templateNotFound,
    'La plantilla no existe.',
  );
}

export function templateInvalid(unknown: readonly string[]): AppError {
  const names = unknown.map((name) => `{{${name}}}`).join(', ');
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    NTF_ERROR_CODES.templateInvalid,
    `La plantilla usa datos que este aviso no tiene: ${names}. Use solo los de la lista.`,
  );
}

export function recordNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    NTF_ERROR_CODES.recordNotFound,
    'El registro no existe.',
  );
}

export function commentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    NTF_ERROR_CODES.commentNotFound,
    'El comentario no existe.',
  );
}

export function attachmentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    NTF_ERROR_CODES.attachmentNotFound,
    'El adjunto no existe.',
  );
}

export function mentionInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    NTF_ERROR_CODES.mentionInvalid,
    'Solo puede mencionar a colaboradores activos de su empresa, y no a usted mismo.',
  );
}

export function fileNotAttachable(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    NTF_ERROR_CODES.fileNotAttachable,
    'Solo puede adjuntar un archivo que usted subió y que ya pasó la revisión del antivirus.',
  );
}
