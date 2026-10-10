import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de terceros que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}
export class PartyCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiPartyWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ErrorResponse.Output,
      description: 'El tercero o el registro no existe, o la persona no lo puede ver',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ErrorResponse.Output,
      description: 'Otra versión, documento repetido o revisión ya cerrada',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
