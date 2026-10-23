import { HttpStatus } from '@nestjs/common';
import { CRM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes del CRM (B22): claros, en español y con trato de usted.

export function crmNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, CRM_ERROR_CODES.notFound, `${what} no existe.`);
}

export function catalogValueInvalid(what: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.catalogValueInvalid,
    `${what} no está entre las opciones activas. Elija una de la lista.`,
  );
}

export function statusInvalid(detail: string): AppError {
  return new AppError(HttpStatus.CONFLICT, CRM_ERROR_CODES.statusInvalid, detail);
}

export function partyInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.partyInvalid,
    'El cliente no existe, se retiró o está bloqueado en Terceros. Elija otro.',
  );
}

export function ownerInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.ownerInvalid,
    'El responsable debe ser un colaborador activo de la empresa.',
  );
}

export function documentRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.documentRequired,
    'Para ganar la oportunidad, registre primero el tipo y el número de documento del cliente en Terceros.',
  );
}

export function campaignInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.campaignInvalid,
    'La campaña no existe. Elija una de la lista.',
  );
}

export function campaignNameTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CRM_ERROR_CODES.campaignDuplicate,
    'Ya existe una campaña con ese nombre. Use otro nombre o edite la existente.',
  );
}
