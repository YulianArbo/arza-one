import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import { createdResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Documentación común de las rutas de Contratos que escriben (numeral 14.2).

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class ContractErrorResponse extends createZodDto(errorResponseSchema) {}
export class ContractCreatedResponse extends createZodDto(createdResponseSchema) {}

export function ApiContractWriteErrors(): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      type: ContractErrorResponse.Output,
      description: 'El registro no existe',
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      type: ContractErrorResponse.Output,
      description: 'Otra versión, o el estado no permite el paso',
    }),
    ApiResponse({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      type: ContractErrorResponse.Output,
      description: 'Datos inválidos o una regla del negocio',
    }),
  );
}

/** Edición con bloqueo optimista: la versión que se vio va en If-Match. */
export function ApiContractIfMatch(): MethodDecorator {
  return ApiHeader({ name: 'If-Match', description: 'Versión del registro', required: true });
}
