import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de privacidad (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}
export class PrivacyCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiPrivacyErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ErrorResponse.Output,
      description: 'El texto, la autorización, la actividad o el encargado no existe',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ErrorResponse.Output,
      description: 'Otra versión, texto ya publicado, borrador existente o autorización revocada',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ErrorResponse.Output,
      description: 'Datos inválidos o una regla de privacidad',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
