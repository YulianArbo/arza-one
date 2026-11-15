import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import type { ApiResponseOptions } from '@nestjs/swagger';
import { errorResponseSchema, purchaseCreatedResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Piezas comunes de los controladores de Compras (B33).

class PurErrorResponse extends createZodDto(errorResponseSchema) {}
export class PurCreatedResponse extends createZodDto(purchaseCreatedResponseSchema) {}

export const UUID = new ParseUUIDPipe({ version: '7' });

export const IF_MATCH = {
  name: 'If-Match',
  description: 'Versión del registro que la persona vio',
  required: true,
};

export const INVALID: ApiResponseOptions = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: PurErrorResponse.Output,
  description: 'Datos no válidos',
};

export const CONFLICT: ApiResponseOptions = {
  status: HttpStatus.CONFLICT,
  type: PurErrorResponse.Output,
  description: 'Estado o versión distinta, o falta la segregación de funciones',
};

export const NOT_FOUND: ApiResponseOptions = {
  status: HttpStatus.NOT_FOUND,
  type: PurErrorResponse.Output,
  description: 'No existe',
};
