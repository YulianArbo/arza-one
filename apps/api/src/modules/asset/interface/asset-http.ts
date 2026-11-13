import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import type { ApiResponseOptions } from '@nestjs/swagger';
import { assetCreatedResponseSchema, errorResponseSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

// Piezas comunes de los controladores de Activos (B34).

class AstErrorResponse extends createZodDto(errorResponseSchema) {}
export class AstCreatedResponse extends createZodDto(assetCreatedResponseSchema) {}

export const UUID = new ParseUUIDPipe({ version: '7' });

export const IF_MATCH = {
  name: 'If-Match',
  description: 'Versión del registro que la persona vio',
  required: true,
};

export const INVALID: ApiResponseOptions = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: AstErrorResponse.Output,
  description: 'Datos no válidos',
};

export const CONFLICT: ApiResponseOptions = {
  status: HttpStatus.CONFLICT,
  type: AstErrorResponse.Output,
  description: 'Estado o versión distinta',
};

export const NOT_FOUND: ApiResponseOptions = {
  status: HttpStatus.NOT_FOUND,
  type: AstErrorResponse.Output,
  description: 'No existe',
};
