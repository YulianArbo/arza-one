import { HttpStatus } from '@nestjs/common';
import { CONTRACT_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import { CompositionError } from '../domain/clause-composition.js';

// Mensajes de Contratos (B24): claros, en español y con trato de usted.

export function contractNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, CONTRACT_ERROR_CODES.notFound, `${what} no existe.`);
}

export function statusInvalid(detail: string): AppError {
  return new AppError(HttpStatus.CONFLICT, CONTRACT_ERROR_CODES.statusInvalid, detail);
}

export function partyInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.partyInvalid,
    'El cliente no existe, se retiró, está inactivo o está bloqueado en Terceros. Elija otro.',
  );
}

export function partyDocumentMissing(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.partyInvalid,
    'Registre primero el tipo y el número de documento del cliente en Terceros: el contrato lo necesita.',
  );
}

export function quoteInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.quoteInvalid,
    'La cotización no existe, no está aceptada o es de otro cliente. Elija una cotización aceptada del mismo cliente.',
  );
}

export function templateInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.templateInvalid,
    'La plantilla no existe o ya no está activa. Elija una de la lista.',
  );
}

export function responsibleInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.responsibleInvalid,
    'El responsable debe ser un colaborador activo de la empresa.',
  );
}

export function datesInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, CONTRACT_ERROR_CODES.datesInvalid, detail);
}

export function valueRequired(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.valueRequired,
    'Escriba el valor y la forma de pago: solo un acuerdo de confidencialidad puede ir sin valor.',
  );
}

export function clauseKeyTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CONTRACT_ERROR_CODES.clauseDuplicate,
    'Ya existe una cláusula con esa clave. Use otra clave o cree una versión nueva de la existente.',
  );
}

export function clauseVariablesUnknown(names: readonly string[]): AppError {
  const list = names.map((name) => `{{${name}}}`).join(', ');
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.clauseVariableUnknown,
    `El texto usa variables que no existen: ${list}. Use solo las de la lista.`,
  );
}

/** El texto del contrato no se pudo armar con las cláusulas pedidas. */
export function clausesInvalid(error: CompositionError): AppError {
  const { problem } = error;
  const detail =
    problem.kind === 'required'
      ? `La cláusula «${problem.title}» es obligatoria en esta plantilla: no se puede quitar.`
      : problem.kind === 'duplicate'
        ? 'Una cláusula de la biblioteca aparece dos veces. Deje solo una.'
        : 'Una de las cláusulas ya no está en la biblioteca. Quítela o escríbala como cláusula nueva.';
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, CONTRACT_ERROR_CODES.clausesInvalid, detail);
}

export function reviewIncomplete(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.reviewIncomplete,
    'Revise y marque una por una todas las cláusulas modificadas o nuevas antes de aprobar.',
  );
}

export function selfApproval(what: string): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    CONTRACT_ERROR_CODES.selfApproval,
    `Quien elaboró ${what} no puede aprobarlo ni devolverlo.`,
  );
}

export function fileInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.fileInvalid,
    'Suba la copia firmada en PDF; debe ser un archivo suyo que ya pasó el antivirus.',
  );
}

export function pdfNotReady(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    CONTRACT_ERROR_CODES.pdfNotReady,
    'El PDF todavía se está preparando o aún no existe. Intente de nuevo en unos segundos.',
  );
}

/** Si el texto no se pudo armar, el mensaje claro; cualquier otro error sigue igual. */
export function asClauseError(error: unknown): unknown {
  return error instanceof CompositionError ? clausesInvalid(error) : error;
}

/** Desde Mis tareas no se revisan las cláusulas: se aprueba desde la ficha del contrato. */
export function reviewInCard(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    CONTRACT_ERROR_CODES.reviewIncomplete,
    'Este contrato tiene cláusulas modificadas o nuevas: apruébelo desde su ficha, donde las revisa una por una.',
  );
}
