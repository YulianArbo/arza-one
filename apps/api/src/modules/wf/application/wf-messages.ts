import { HttpStatus } from '@nestjs/common';
import { ACCESS_ERROR_CODES, WF_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { TransitionProblem } from '../domain/engine.js';

// Mensajes del motor de flujos y las tareas (B15): claros, en español y con trato de usted.

export function definitionNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    WF_ERROR_CODES.definitionNotFound,
    'El flujo no existe.',
  );
}

export function definitionInvalid(problems: readonly string[]): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    WF_ERROR_CODES.definitionInvalid,
    `El flujo no se puede guardar así: ${problems.join(' ')}`,
  );
}

export function definitionNotDraft(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.definitionNotDraft,
    'Esta versión ya se publicó y no se puede cambiar. Cree una versión nueva.',
  );
}

export function definitionKeyTaken(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.definitionKeyTaken,
    'Ya existe un flujo con esa clave.',
  );
}

export function draftExists(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.draftExists,
    'Este flujo ya tiene un borrador en edición. Termínelo o publíquelo primero.',
  );
}

export function noPublishedVersion(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    WF_ERROR_CODES.noPublishedVersion,
    'El flujo no tiene una versión publicada; no se puede iniciar un trámite con él.',
  );
}

export function instanceNotFound(): AppError {
  return new AppError(
    HttpStatus.NOT_FOUND,
    WF_ERROR_CODES.instanceNotFound,
    'El trámite no existe.',
  );
}

export function instanceActive(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.instanceActive,
    'Este registro ya tiene un trámite en curso.',
  );
}

export function taskNotFound(): AppError {
  return new AppError(HttpStatus.NOT_FOUND, WF_ERROR_CODES.taskNotFound, 'La tarea no existe.');
}

export function taskClosed(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.taskClosed,
    'La tarea ya está cerrada. Recargue para ver su estado.',
  );
}

export function taskActionNotAllowed(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, WF_ERROR_CODES.taskActionNotAllowed, message);
}

export function personInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    WF_ERROR_CODES.personInvalid,
    'La persona elegida no es un colaborador activo, o es usted mismo.',
  );
}

const TRANSITION_MESSAGES: Readonly<Record<TransitionProblem, [HttpStatus, string, string]>> = {
  not_defined: [
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.transitionNotAllowed,
    'Esa acción no está definida en el flujo para el estado actual.',
  ],
  reserved: [
    HttpStatus.CONFLICT,
    WF_ERROR_CODES.transitionNotAllowed,
    'Este paso se decide con las aprobaciones de sus tareas.',
  ],
  permission: [
    HttpStatus.FORBIDDEN,
    ACCESS_ERROR_CODES.permissionDenied,
    'Usted no tiene permiso para esta acción.',
  ],
  not_participant: [
    HttpStatus.FORBIDDEN,
    ACCESS_ERROR_CODES.permissionDenied,
    'Esta acción le corresponde a quien atiende el paso actual.',
  ],
  condition: [
    HttpStatus.UNPROCESSABLE_ENTITY,
    WF_ERROR_CODES.conditionNotMet,
    'El registro todavía no cumple la condición de esta acción.',
  ],
  comment: [
    HttpStatus.UNPROCESSABLE_ENTITY,
    WF_ERROR_CODES.commentRequired,
    'Esta acción exige un comentario.',
  ],
};

export function transitionRejected(problem: TransitionProblem): AppError {
  const [status, code, message] = TRANSITION_MESSAGES[problem];
  return new AppError(status, code, message);
}
