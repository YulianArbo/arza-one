import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de avisos, comentarios y adjuntos (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ErrorResponse extends createZodDto(errorResponseSchema) {}
export class NtfCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiNtfWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ErrorResponse.Output,
      description: 'El aviso, la plantilla, el registro, el comentario o el adjunto no existe',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ErrorResponse.Output,
      description: 'Otra persona cambió la plantilla mientras usted la editaba',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ErrorResponse.Output,
      description: 'Datos inválidos, mención no permitida o archivo que no se puede adjuntar',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión de la plantilla', required: true });
}
