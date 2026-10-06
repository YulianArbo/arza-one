import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { versionResponseSchema } from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../access/access.decorators.js';
import { ApiCommonErrors } from '../openapi/api-common-errors.js';
import { VERSION_INFO } from './version-info.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class VersionResponse extends createZodDto(versionResponseSchema) {}

@ApiTags('Plataforma')
@Controller('version')
@Public()
export class VersionController {
  constructor(@Inject(VERSION_INFO) private readonly info: VersionResponse) {}

  @Get()
  @ApiOperation({ summary: 'Versión, ambiente y commit de la API' })
  @ZodResponse({ status: HttpStatus.OK, type: VersionResponse })
  @ApiCommonErrors()
  get(): VersionResponse {
    return this.info;
  }
}
