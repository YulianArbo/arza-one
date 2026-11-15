import { applyDecorators, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de la mesa de ayuda que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ServiceErrorResponse extends createZodDto(errorResponseSchema) {}
export class ServiceCreatedResponse extends createZodDto(createdResponseSchema) {}

export const UUID = new ParseUUIDPipe();

export function ApiServiceWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ServiceErrorResponse.Output,
      description: 'El registro no existe o la persona no puede verlo',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ServiceErrorResponse.Output,
      description: 'Otra versión, o el estado no permite el paso',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ServiceErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiServiceIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
