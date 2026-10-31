import { applyDecorators, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de Proyectos que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ProjectErrorResponse extends createZodDto(errorResponseSchema) {}
export class ProjectCreatedResponse extends createZodDto(createdResponseSchema) {}

export const UUID = new ParseUUIDPipe();

export function ApiProjectWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ProjectErrorResponse.Output,
      description: 'El registro no existe o la persona no es del proyecto',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ProjectErrorResponse.Output,
      description: 'Otra versión, o el estado no permite el paso',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ProjectErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiProjectIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
