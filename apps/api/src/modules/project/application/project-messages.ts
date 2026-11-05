import { HttpStatus } from '@nestjs/common';
import { PROJECT_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';

// Mensajes de Proyectos (B26): claros, en español y con trato de usted.

export function projectNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, PROJECT_ERROR_CODES.notFound, `${what} no existe.`);
}

export function statusInvalid(detail: string): AppError {
  return new AppError(HttpStatus.CONFLICT, PROJECT_ERROR_CODES.statusInvalid, detail);
}

export function contractInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.contractInvalid,
    'El contrato no existe, no está vigente o ya tiene un proyecto. Elija uno de la lista de contratos vigentes sin proyecto.',
  );
}

export function partyInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.partyInvalid,
    'Sin contrato, elija el cliente en Terceros; con contrato, el cliente es el del contrato.',
  );
}

export function datesInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PROJECT_ERROR_CODES.datesInvalid, detail);
}

export function memberInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PROJECT_ERROR_CODES.memberInvalid, detail);
}

export function memberDuplicate(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PROJECT_ERROR_CODES.memberDuplicate,
    'Esa persona ya está en el equipo. Cambie su rol o su dedicación en lugar de agregarla otra vez.',
  );
}

export function billingExceeded(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.billingExceeded,
    'Entre todos los hitos se factura como máximo el 100 % del valor. Ajuste los porcentajes.',
  );
}

export function sprintActive(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PROJECT_ERROR_CODES.sprintActive,
    'Ya hay una iteración en curso. Ciérrela antes de iniciar otra.',
  );
}

export function criteriaRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.criteriaRequired,
    'Escriba los criterios de aceptación del ítem antes de llevarlo a una iteración. Las épicas no entran a iteraciones.',
  );
}

export function evidenceRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.evidenceRequired,
    'Para terminar el ítem, escriba el enlace a la revisión de código y qué pruebas se hicieron.',
  );
}

export function moveInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PROJECT_ERROR_CODES.moveInvalid, detail);
}

export function parentInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.parentInvalid,
    'Una historia va dentro de una épica; una tarea o un defecto, dentro de una épica o una historia del mismo proyecto.',
  );
}

export function authorizationRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PROJECT_ERROR_CODES.authorizationRequired,
    'El proyecto no tiene un contrato vigente: pida a la Dirección la autorización para iniciarlo.',
  );
}
