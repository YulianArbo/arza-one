import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { healthResponseSchema } from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../access/access.decorators.js';
import { ApiCommonErrors } from '../openapi/api-common-errors.js';
import { HealthService } from './health.service.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class HealthResponse extends createZodDto(healthResponseSchema) {}

@ApiTags('Plataforma')
@Controller('health')
@Public()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Estado de la API y de la base de datos, las colas y los archivos' })
  @ZodResponse({ status: HttpStatus.OK, type: HealthResponse, description: 'Todo responde' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    type: HealthResponse.Output,
    description: 'Al menos una pieza no responde',
  })
  @ApiCommonErrors()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
