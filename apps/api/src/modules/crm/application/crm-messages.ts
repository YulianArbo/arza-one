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

export function serviceNameTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CRM_ERROR_CODES.serviceDuplicate,
    'Ya existe un servicio con ese nombre en el portafolio. Use otro nombre o edite el existente.',
  );
}

export function serviceInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.serviceInvalid,
    'El servicio no existe o ya no está activo en el portafolio. Elija otro de la lista.',
  );
}

export function taxInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.taxInvalid,
    'Ese impuesto no tiene una tarifa vigente. Elija uno de la lista o pida al Contador que lo registre.',
  );
}

export function validUntilInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CRM_ERROR_CODES.validUntilInvalid,
    'La vigencia debe terminar hoy o más adelante. Elija otra fecha.',
  );
}

export function selfApproval(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    CRM_ERROR_CODES.selfApproval,
    'Quien elaboró la cotización no puede aprobarla ni devolverla.',
  );
}

export function pdfNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CRM_ERROR_CODES.pdfNotReady,
    'El PDF de la cotización todavía se está preparando. Intente de nuevo en unos segundos.',
  );
}

export function quoteLinkInvalid(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    CRM_ERROR_CODES.quoteLinkInvalid,
    'El enlace no es válido. Revise que lo copió completo o pida a quien le envió la cotización uno nuevo.',
  );
}

/** Mensaje del numeral 14.2: «La cotización venció el 15/10/2026 y no puede aceptarse». */
export function quoteExpired(validUntil: string): AppError {
  const [year, month, day] = validUntil.split('-');
  return new AppError(
    HttpStatus.CONFLICT,
    CRM_ERROR_CODES.quoteExpired,
    `La cotización venció el ${day ?? ''}/${month ?? ''}/${year ?? ''} y no puede aceptarse.`,
  );
}
