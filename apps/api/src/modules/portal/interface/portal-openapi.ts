import { applyDecorators, HttpStatus, ParseEnumPipe, ParseUUIDPipe } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  createdResponseSchema,
  errorResponseSchema,
  type PortalDocumentKind,
} from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas del portal del cliente (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PortalErrorResponse extends createZodDto(errorResponseSchema) {}
export class PortalCreatedResponse extends createZodDto(createdResponseSchema) {}

export const UUID = new ParseUUIDPipe();

/** Clase de documento en la dirección de descarga. */
export const DOCUMENT_KIND = new ParseEnumPipe({
  contract: 'contract',
  amendment: 'amendment',
  acceptance: 'acceptance',
  shared: 'shared',
} satisfies Record<PortalDocumentKind, PortalDocumentKind>);

/** Errores de toda ruta del portal: la cuenta sin empresa o los términos sin aceptar. */
export function ApiPortalErrors(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: PortalErrorResponse.Output,
      description: 'No existe o es de otra empresa',
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      type: PortalErrorResponse.Output,
      description: 'Faltan por publicar los términos de uso del portal',
    }),
  );
}

export function ApiPortalWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: PortalErrorResponse.Output,
      description: 'Otra versión, o el estado no permite el paso',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: PortalErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}
