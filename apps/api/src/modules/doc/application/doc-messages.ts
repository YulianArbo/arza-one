import { HttpStatus } from '@nestjs/common';
import { DOC_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de documentos, versiones y expedientes (B18): claros y con trato de usted.

export function folderNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.folderNotFound,
    'La carpeta no existe.',
  );
}

export function folderInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.folderInvalid,
    'Un expediente debe ser de un tercero registrado y no puede contener otro expediente.',
  );
}

export function caseFileExists(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.caseFileExists,
    'Ese tercero ya tiene su expediente. Búsquelo en el explorador.',
  );
}

export function documentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.documentNotFound,
    'El documento no existe o usted no tiene acceso a él.',
  );
}

export function referenceInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.referenceInvalid,
    'Revise el tipo, el proceso, el cargo o el registro: deben existir y estar activos.',
  );
}

export function versionNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    DOC_ERROR_CODES.versionNotFound,
    'La versión no existe o usted no tiene acceso a ella.',
  );
}

export function versionNotEditable(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.versionNotEditable,
    'Solo quien elaboró el borrador puede cambiarlo, y solo mientras es borrador. Una versión ' +
      'vigente no se modifica: cree una versión nueva.',
  );
}

export function versionInProgress(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.versionInProgress,
    'El documento ya tiene una versión en trámite. Termínela antes de crear otra.',
  );
}

export function transitionNotAllowed(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.transitionNotAllowed,
    'Ese paso no es posible en el estado actual de la versión o usted no puede darlo.',
  );
}

export function selfApproval(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    DOC_ERROR_CODES.selfApproval,
    'Quien elabora una versión no puede aprobarla ni devolverla. Pida a otra persona que la revise.',
  );
}

export function sourceInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    DOC_ERROR_CODES.sourceInvalid,
    'Use un PDF, Word o Excel que usted subió y que ya pasó la revisión del antivirus.',
  );
}

export function pdfNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.pdfNotReady,
    'El PDF de esta versión todavía no está listo o no se pudo generar.',
  );
}

export function integrityFailed(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    DOC_ERROR_CODES.integrityFailed,
    'El archivo guardado no coincide con su huella: pudo ser alterado. No se entrega y se avisó ' +
      'a seguridad.',
  );
}

export function linkNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, DOC_ERROR_CODES.linkNotFound, 'El vínculo no existe.');
}
