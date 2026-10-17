import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de documentos, versiones y expedientes (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}
export class DocCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiDocErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ErrorResponse.Output,
      description: 'La carpeta, el documento, la versión o el vínculo no existe o no es visible',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ErrorResponse.Output,
      description:
        'Otra versión del registro, versión en trámite, paso no permitido, PDF sin listo o huella alterada',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ErrorResponse.Output,
      description: 'Datos inválidos, referencia inexistente o archivo fuente no permitido',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
