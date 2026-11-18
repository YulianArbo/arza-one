import { HttpStatus } from '@nestjs/common';

import { ACCESS_ERROR_CODES, IAM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

/** La empresa elegida no está registrada en Terceros como cliente activo. */
export function clientCompanyInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.clientCompanyInvalid,
    'Elija una empresa registrada en Terceros como cliente activo.',
  );
}

export function emailTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    IAM_ERROR_CODES.emailTaken,
    'Ya existe una cuenta con ese correo.',
  );
}

export function invitationNotQueued(): Error {
  return new Error(
    'La cuenta quedó invitada, pero el correo no se pudo enviar. Intente reenviar la invitación en unos minutos.',
  );
}

export function missingSystemRoles(): Error {
  return new Error('La empresa no tiene los roles del sistema. Ejecute pnpm db:seed.');
}
