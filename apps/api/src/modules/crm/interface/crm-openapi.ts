import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas del CRM que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class CrmErrorResponse extends createZodDto(errorResponseSchema) {}
export class CrmCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiCrmWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: CrmErrorResponse.Output,
      description: 'El registro no existe',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: CrmErrorResponse.Output,
      description: 'Otra versión, o el registro ya está cerrado',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: CrmErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiCrmIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
