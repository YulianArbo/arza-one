import { HttpStatus } from '@nestjs/common';
import { IAM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { PasswordProblem } from '../domain/password-policy.js';

// Mensajes de identidad para la persona (numeral 16.6: claros, en español, trato de usted). Ninguno
// revela si un correo tiene cuenta (numeral 15.1).

export const FORGOT_PASSWORD_MESSAGE =
  'Si el correo corresponde a una cuenta activa, en unos minutos recibirá un enlace para crear una contraseña nueva. El enlace vence en 30 minutos.';

export function invalidCredentials(): AppError {
  return new AppError(
    HttpStatus.UNAUTHORIZED,
    IAM_ERROR_CODES.invalidCredentials,
    'El correo o la contraseña no son correctos.',
  );
}

export function loginDelayed(retryAfterSeconds: number): AppError {
  const unit = retryAfterSeconds === 1 ? 'segundo' : 'segundos';
  return new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    IAM_ERROR_CODES.loginDelayed,
    `Por seguridad, espere ${String(retryAfterSeconds)} ${unit} antes de intentarlo de nuevo.`,
    retryAfterSeconds,
  );
}

export function accountLocked(retryAfterSeconds: number): AppError {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    IAM_ERROR_CODES.accountLocked,
    `Por seguridad, el acceso con este correo quedó bloqueado por varios intentos fallidos. Intente de nuevo en ${String(minutes)} ${unit} o recupere su contraseña.`,
    retryAfterSeconds,
  );
}

export function linkInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    IAM_ERROR_CODES.linkInvalid,
    'El enlace no es válido, ya se usó o venció. Pida uno nuevo.',
  );
}

export function currentPasswordIncorrect(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    IAM_ERROR_CODES.currentPasswordIncorrect,
    'La contraseña actual no es correcta.',
  );
}

export function passwordUnchanged(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    IAM_ERROR_CODES.passwordUnchanged,
    'La contraseña nueva debe ser distinta de la actual.',
  );
}

const PASSWORD_PROBLEMS: Readonly<Record<PasswordProblem, { code: string; message: string }>> = {
  too_short: {
    code: IAM_ERROR_CODES.passwordTooShort,
    message: 'La contraseña debe tener al menos 12 caracteres. Una frase fácil de recordar sirve.',
  },
  too_long: {
    code: IAM_ERROR_CODES.passwordTooLong,
    message: 'La contraseña no puede tener más de 128 caracteres.',
  },
  breached: {
    code: IAM_ERROR_CODES.passwordBreached,
    message: 'Esa contraseña aparece en listas de contraseñas filtradas en internet. Elija otra.',
  },
};

export function passwordRejected(problem: PasswordProblem): AppError {
  const { code, message } = PASSWORD_PROBLEMS[problem];
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
}
