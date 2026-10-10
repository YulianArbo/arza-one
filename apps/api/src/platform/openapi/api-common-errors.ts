import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/** Documenta los errores que cualquier ruta puede devolver (numeral 14.2). */
export function ApiCommonErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.TOO_MANY_REQUESTS,
      type: ErrorResponse.Output,
      description: 'Límite de peticiones superado',
    }),
    ApiResponse({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      type: ErrorResponse.Output,
      description: 'Error inesperado; incluye el identificador de correlación',
    }),
  );
}

/** Documenta los errores de las rutas con permiso (B10): sin sesión y sin permiso. */
export function ApiPermissionErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      type: ErrorResponse.Output,
      description: 'Sin sesión válida',
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      type: ErrorResponse.Output,
      description: 'Sin el permiso de la ruta, o falta confirmar la identidad',
    }),
    ApiCommonErrors(),
  );
}
