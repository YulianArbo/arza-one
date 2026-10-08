import { HttpException, HttpStatus } from '@nestjs/common';
import {
  PLATFORM_ERROR_CODES as CODES,
  type ErrorDetail,
  type ErrorResponse,
} from '@arza/contracts';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';

import { AppError } from './app-error.js';

export interface MappedError {
  readonly status: number;
  readonly body: ErrorResponse;
  /** Segundos de espera para la cabecera Retry-After, si aplica. */
  readonly retryAfterSeconds?: number;
}

interface KnownError {
  readonly code: string;
  readonly message: string;
}

// Errores HTTP conocidos y su mensaje para la persona (numeral 14.2).
const KNOWN_ERRORS: Readonly<Partial<Record<number, KnownError>>> = {
  [HttpStatus.BAD_REQUEST]: { code: CODES.badRequest, message: 'La petición está mal formada.' },
  [HttpStatus.UNAUTHORIZED]: {
    code: CODES.unauthenticated,
    message: 'Debe iniciar sesión para continuar.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: CODES.forbidden,
    message: 'No tiene permiso para realizar esta acción.',
  },
  [HttpStatus.NOT_FOUND]: { code: CODES.notFound, message: 'El recurso solicitado no existe.' },
  [HttpStatus.CONFLICT]: {
    code: CODES.conflict,
    message: 'La operación entra en conflicto con el estado actual del registro.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: CODES.payloadTooLarge,
    message: 'El contenido enviado supera el tamaño permitido.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: CODES.validationFailed,
    message: 'Los datos enviados no son válidos. Revise los campos señalados.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: CODES.rateLimited,
    message: 'Ha realizado demasiadas peticiones. Espere un momento e intente de nuevo.',
  },
};

const OTHER_CLIENT_ERROR = 'La petición no pudo procesarse.';

function unexpectedError(correlationId: string): KnownError {
  return {
    code: CODES.internalError,
    message: `Ocurrió un error inesperado. Si el problema continúa, comuníquese con soporte e indique el código ${correlationId}.`,
  };
}

function knownError(status: number): KnownError {
  return KNOWN_ERRORS[status] ?? { code: `HTTP_${String(status)}`, message: OTHER_CLIENT_ERROR };
}

function validationDetails(exception: ZodValidationException): ErrorDetail[] {
  const zodError = exception.getZodError();
  if (!(zodError instanceof z.ZodError)) return [];
  return zodError.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.code }));
}

/**
 * Estado HTTP de un error de cliente, o undefined si el error es inesperado. Además de las
 * excepciones de NestJS reconoce las de Express (http-errors), que marcan con `expose` los
 * errores seguros de informar, como un cuerpo demasiado grande.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  const candidate = z
    .object({ status: z.number().int(), expose: z.literal(true) })
    .safeParse(exception);
  return candidate.success ? candidate.data.status : undefined;
}

function build(status: number, known: KnownError, details: ErrorDetail[], id: string): MappedError {
  return { status, body: { error: { ...known, details, correlation_id: id } } };
}

/** Traduce cualquier excepción al formato único de error. Nunca expone trazas ni mensajes internos. */
export function mapException(exception: unknown, correlationId: string): MappedError {
  if (exception instanceof AppError) {
    const known = { code: exception.code, message: exception.message };
    const mapped = build(exception.status, known, [], correlationId);
    const { retryAfterSeconds } = exception;
    return retryAfterSeconds === undefined ? mapped : { ...mapped, retryAfterSeconds };
  }
  if (exception instanceof ZodValidationException) {
    const status = HttpStatus.UNPROCESSABLE_ENTITY;
    return build(status, knownError(status), validationDetails(exception), correlationId);
  }
  const status = clientErrorStatus(exception);
  if (status !== undefined && status >= 400 && status < 500) {
    return build(status, knownError(status), [], correlationId);
  }
  const internal = HttpStatus.INTERNAL_SERVER_ERROR;
  return build(internal, unexpectedError(correlationId), [], correlationId);
}
