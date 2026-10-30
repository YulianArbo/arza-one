import { HttpStatus } from '@nestjs/common';
import { SIGNATURE_ERROR_CODES, SIGNATURE_RULES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de la firma electrónica (B25): claros, en español y con trato de usted. Los del enlace
// no dicen si la llave existe ni a quién pertenece.

export function envelopeNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    SIGNATURE_ERROR_CODES.notFound,
    'El proceso de firma no existe.',
  );
}

export function signatureStatusInvalid(detail: string): AppError {
  return new AppError(HttpStatus.CONFLICT, SIGNATURE_ERROR_CODES.statusInvalid, detail);
}

export function signersInvalid(detail: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.signersInvalid,
    detail,
  );
}

export function partyNotVerified(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.partyNotVerified,
    'El conocimiento del cliente (FT-COM-003) debe estar aprobado en Terceros antes de enviar a firma: así se verifican el correo y el documento de quienes firman.',
  );
}

export function signatureDatesInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.datesInvalid,
    `El último día para firmar debe estar entre hoy y dentro de ${String(SIGNATURE_RULES.maxDays)} días.`,
  );
}

export function signatureLinkInvalid(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    SIGNATURE_ERROR_CODES.linkInvalid,
    'Este enlace no es válido o ya venció. Use el enlace del último correo que recibió o pida uno nuevo a quien le envió el documento.',
  );
}

export function codeInvalid(attemptsLeft: number): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.codeInvalid,
    `El código no es correcto. Le quedan ${String(attemptsLeft)} ${attemptsLeft === 1 ? 'intento' : 'intentos'}.`,
  );
}

export function codeExpired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.codeExpired,
    `El código venció: dura ${String(SIGNATURE_RULES.codeMinutes)} minutos. Pida uno nuevo.`,
  );
}

export function codeLocked(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    SIGNATURE_ERROR_CODES.codeLocked,
    'Por seguridad, este enlace se bloqueó después de cinco códigos equivocados. Pida un enlace nuevo a quien le envió el documento.',
  );
}

export function codeTooSoon(seconds: number): AppError {
  return new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    SIGNATURE_ERROR_CODES.codeTooSoon,
    'Ya le enviamos un código hace un momento. Revise su correo, también la carpeta de correo no deseado, y espere un minuto para pedir otro.',
    seconds,
  );
}

export function ticketInvalid(): AppError {
  return new AppError(
    HttpStatus.UNAUTHORIZED,
    SIGNATURE_ERROR_CODES.codeExpired,
    'Su confirmación del código venció. Pida un código nuevo para continuar.',
  );
}

export function notYourTurn(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    SIGNATURE_ERROR_CODES.notYourTurn,
    'Todavía no le corresponde firmar: el documento se firma en orden. Le avisaremos por correo cuando sea su turno.',
  );
}

export function signedCopyNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    SIGNATURE_ERROR_CODES.statusInvalid,
    'El documento firmado todavía se está preparando. Intente de nuevo en unos segundos.',
  );
}
