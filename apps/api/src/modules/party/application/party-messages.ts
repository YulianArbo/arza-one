import { HttpStatus } from '@nestjs/common';
import { PARTY_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { MergeProblem } from '../domain/merge.js';
import type { ReviewProblem } from '../domain/reviews.js';

// Mensajes de terceros (B13): claros, en español y con trato de usted.

export function partyNotFound(what = 'El tercero'): AppError {
  return new AppError(HttpStatus.NOT_FOUND, PARTY_ERROR_CODES.notFound, `${what} no existe.`);
}

export function partyDuplicate(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PARTY_ERROR_CODES.duplicate,
    'Ya existe un tercero con ese tipo y número de documento. Abra el existente en lugar de crear otro.',
  );
}

export function kindChange(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PARTY_ERROR_CODES.kindChange,
    'Un tercero no cambia de persona a organización ni al revés. Registre uno nuevo y fusione si hace falta.',
  );
}

export function catalogValueInvalid(what: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PARTY_ERROR_CODES.catalogValueInvalid,
    `${what} no está entre las opciones activas. Elija una de la lista.`,
  );
}

export function statusTransitionInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PARTY_ERROR_CODES.statusTransitionInvalid,
    'Ese cambio de estado no está permitido desde el estado actual.',
  );
}

export function contactInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, PARTY_ERROR_CODES.contactInvalid, detail);
}

const REVIEW_MESSAGES: Readonly<Record<ReviewProblem, string>> = {
  same_person: 'Usted lo registró: debe aprobarlo o rechazarlo otra persona.',
  closed: 'Ya fue revisado. Si algo cambió, registre uno nuevo.',
};

export function reviewNotAllowed(problem: ReviewProblem): AppError {
  return problem === 'same_person'
    ? new AppError(HttpStatus.FORBIDDEN, PARTY_ERROR_CODES.sameReviewer, REVIEW_MESSAGES[problem])
    : new AppError(HttpStatus.CONFLICT, PARTY_ERROR_CODES.reviewClosed, REVIEW_MESSAGES[problem]);
}

const MERGE_MESSAGES: Readonly<Record<MergeProblem, string>> = {
  same_party: 'Un tercero no se fusiona consigo mismo.',
  different_kind: 'Solo se fusionan dos personas o dos organizaciones.',
};

export function mergeInvalid(problem: MergeProblem): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PARTY_ERROR_CODES.mergeInvalid,
    MERGE_MESSAGES[problem],
  );
}

export function nextReviewInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    PARTY_ERROR_CODES.nextReviewInvalid,
    'La próxima revisión debe ser una fecha posterior a hoy.',
  );
}
