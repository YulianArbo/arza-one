import { HttpStatus } from '@nestjs/common';
import { ACCESS_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { DelegationProblem, ExpiryProblem } from '../domain/access-policy.js';

// Mensajes de roles, permisos y delegaciones (B10): claros, en español y con trato de usted.

export function selfPermissionChange(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    ACCESS_ERROR_CODES.selfPermissionChange,
    'Nadie puede cambiar sus propios roles o permisos. Pídale el cambio a otro administrador.',
  );
}

export function selfAction(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    ACCESS_ERROR_CODES.selfAction,
    'Esta acción no se puede hacer sobre su propia cuenta.',
  );
}

export function userNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    ACCESS_ERROR_CODES.userNotFound,
    'El usuario no existe.',
  );
}

export function roleNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, ACCESS_ERROR_CODES.roleNotFound, 'El rol no existe.');
}

export function assignmentNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    ACCESS_ERROR_CODES.assignmentNotFound,
    'La asignación no existe o ya se retiró.',
  );
}

export function delegationNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    ACCESS_ERROR_CODES.delegationNotFound,
    'La delegación no existe o ya se retiró.',
  );
}

export function systemRoleReadonly(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.systemRoleReadonly,
    'Los roles del sistema no se editan. Cree un rol personalizado con los ajustes que necesita.',
  );
}

export function roleNameTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ACCESS_ERROR_CODES.roleNameTaken,
    'Ya existe un rol con ese nombre. Elija otro.',
  );
}

export function roleAudienceMismatch(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.roleAudienceMismatch,
    'Ese rol es para otro tipo de usuario: los roles del portal son para clientes y los demás para personas internas.',
  );
}

export function roleAlreadyAssigned(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ACCESS_ERROR_CODES.roleAlreadyAssigned,
    'La persona ya tiene ese rol vigente.',
  );
}

const EXPIRY_MESSAGES: Readonly<Record<ExpiryProblem, string>> = {
  in_past: 'La fecha de vencimiento debe ser posterior a hoy.',
  required: 'El rol de auditor siempre tiene fecha de vencimiento, de 90 días como máximo.',
  too_long: 'El rol de auditor vence a los 90 días como máximo.',
};

export function roleExpiryInvalid(problem: ExpiryProblem): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.roleExpiryInvalid,
    EXPIRY_MESSAGES[problem],
  );
}

export function permissionScopeInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.permissionScopeInvalid,
    'Algún permiso no se puede limitar a «solo lo propio», o no corresponde a este tipo de rol.',
  );
}

const DELEGATION_MESSAGES: Readonly<Record<DelegationProblem | 'not_held' | 'person', string>> = {
  same_person: 'Una persona no se puede delegar a sí misma.',
  to_actor: 'No puede registrar una delegación a su favor. Pídasela a otro administrador.',
  ends_before_start: 'La fecha final debe ser posterior a la inicial.',
  ends_in_past: 'La fecha final ya pasó.',
  too_long: 'Una delegación dura 60 días como máximo.',
  not_held: 'Solo se pueden delegar aprobaciones que quien delega tiene hoy.',
  person: 'Las dos personas deben ser usuarios internos activos de la empresa.',
};

export function delegationInvalid(problem: DelegationProblem | 'not_held' | 'person'): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ACCESS_ERROR_CODES.delegationInvalid,
    DELEGATION_MESSAGES[problem],
  );
}

export function userStateInvalid(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, ACCESS_ERROR_CODES.userStateInvalid, message);
}
