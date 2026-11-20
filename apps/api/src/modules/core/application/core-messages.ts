import { HttpStatus } from '@nestjs/common';
import { CORE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { ValidFromProblem } from '../domain/parameter-policy.js';

// Mensajes del núcleo (B12): claros, en español y con trato de usted.

/** Un comunicado que ya no se vería nunca: su fecha de fin quedó en el pasado. */
export function announcementPast(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.announcementPast,
    'La fecha de fin ya pasó: el comunicado no se vería. Elija una fecha de hoy en adelante.',
  );
}

/** Un comunicado terminado ya no se edita ni se vuelve a terminar. */
export function announcementEnded(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CORE_ERROR_CODES.announcementEnded,
    'El comunicado ya está terminado. Si necesita publicarlo otra vez, cree uno nuevo.',
  );
}

export function recordNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, CORE_ERROR_CODES.notFound, `${what} no existe.`);
}

export function codeTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CORE_ERROR_CODES.codeTaken,
    'Ya existe un registro con ese código, activo, inactivo o eliminado. Elija otro.',
  );
}

export function taxIdTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CORE_ERROR_CODES.taxIdTaken,
    'Ese NIT ya está registrado en la plataforma.',
  );
}

export function recordInUse(detail: string): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CORE_ERROR_CODES.inUse,
    `No se puede eliminar: ${detail}. Inactívelo en su lugar.`,
  );
}

export function hierarchyCycle(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.hierarchyCycle,
    'Esa jerarquía no es posible: el registro quedaría por encima de sí mismo.',
  );
}

export function mainSiteRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.mainSiteRequired,
    'La sede principal no se puede inactivar, eliminar ni dejar de ser principal. Marque otra sede como principal primero.',
  );
}

export function parameterUnknown(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    CORE_ERROR_CODES.parameterUnknown,
    'Ese parámetro no existe.',
  );
}

const VALID_FROM_MESSAGES: Readonly<Record<ValidFromProblem, string>> = {
  in_past: 'La vigencia nueva debe empezar hoy o más adelante: el pasado no se reescribe.',
  not_after_latest:
    'La vigencia nueva debe empezar después de la última registrada. Elija una fecha posterior.',
};

export function parameterValueInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.parameterValueInvalid,
    'El valor no corresponde a este parámetro. Revise los datos e intente de nuevo.',
  );
}

export function parameterValidFromInvalid(problem: ValidFromProblem): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.parameterValidFromInvalid,
    VALID_FROM_MESSAGES[problem],
  );
}

export function sequenceUnknown(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CORE_ERROR_CODES.sequenceUnknown,
    'Ese tipo de consecutivo no está configurado. Créelo en Administración › Consecutivos.',
  );
}

export function holidayTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CORE_ERROR_CODES.holidayTaken,
    'Esa fecha ya está registrada como festivo.',
  );
}
