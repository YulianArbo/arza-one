import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { opsStatusResponseSchema } from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { MonitorToken } from '../access/access.decorators.js';
import { ApiCommonErrors } from '../openapi/api-common-errors.js';
import { OpsStatusService } from './ops-status.service.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class OpsStatusResponse extends createZodDto(opsStatusResponseSchema) {}

@ApiTags('Plataforma')
@Controller('ops')
@MonitorToken()
// Igual que /health: debe responder aunque Valkey (donde vive el conteo del límite) no lo haga.
@SkipThrottle()
export class OpsController {
  constructor(@Inject(OpsStatusService) private readonly ops: OpsStatusService) {}

  @Get('status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cifras de operación para los vigilantes: tiempos, errores y colas (numeral 10.7)',
  })
  @ZodResponse({ status: HttpStatus.OK, type: OpsStatusResponse, description: 'Sin alertas' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    type: OpsStatusResponse.Output,
    description: 'Al menos una cifra pasa su umbral',
  })
  @ApiCommonErrors()
  async status(@Res({ passthrough: true }) response: Response): Promise<OpsStatusResponse> {
    const result = await this.ops.status();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
