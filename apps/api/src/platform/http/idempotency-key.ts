import { HttpStatus } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { PLATFORM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../errors/app-error.js';

// Idempotencia (numerales 13.1 paso 9 y 14.1): en las operaciones sensibles, como el envío a firma,
// quien llama manda una llave única en la cabecera Idempotency-Key. Si la misma petición llega dos
// veces con la misma llave (un doble clic, un reintento de la red), la segunda no hace nada nuevo y
// responde lo mismo. El caso de uso guarda la llave junto al registro que cambió y la compara.

function keyRequired(): AppError {
  return new AppError(
    HttpStatus.BAD_REQUEST,
    PLATFORM_ERROR_CODES.idempotencyKeyRequired,
    'Falta la llave de la operación (cabecera Idempotency-Key). Recargue la página e intente de nuevo.',
  );
}

/** La llave ya se usó en otra operación: no se repite esta con ella. */
export function idempotencyKeyReused(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    PLATFORM_ERROR_CODES.idempotencyKeyReused,
    'Esta operación ya se hizo con otros datos. Recargue la página para ver cómo quedó.',
  );
}

/** La llave de la cabecera: de 16 a 128 letras, números, guiones o guiones bajos (un UUID sirve). */
export function idempotencyKeyFrom(header: string | undefined): string {
  const value = header?.trim();
  if (value === undefined || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw keyRequired();
  return value;
}

/** Documenta la cabecera en el OpenAPI. */
export function ApiIdempotencyKey(): MethodDecorator {
  return ApiHeader({
    name: 'Idempotency-Key',
    description: 'Llave única de la operación (un UUID); repetirla no repite la operación',
    required: true,
  });
}
