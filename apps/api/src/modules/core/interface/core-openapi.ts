import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas del núcleo que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}
export class CoreCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiCoreWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ErrorResponse.Output,
      description: 'No existe',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ErrorResponse.Output,
      description: 'Otra versión, código repetido o registro en uso',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición o borrado con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
