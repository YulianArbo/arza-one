import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  linkObjectiveIndicatorsSchema,
  qmsCodeResponseSchema,
  saveStrategicObjectiveSchema,
  strategicObjectiveListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { StrategicObjectives } from '../application/strategic-objectives.js';

class StrategicObjectiveListResponse extends createZodDto(strategicObjectiveListResponseSchema) {}
class StrategicObjectiveBody extends createZodDto(saveStrategicObjectiveSchema) {}
class ObjectiveIndicatorsBody extends createZodDto(linkObjectiveIndicatorsSchema) {}
class StrategicObjectiveCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Objetivos del plan estratégico para el cuadro de mando (B46, decisión 4).

@ApiTags('Dirección')
@Controller('v1/qms/strategic-objectives')
@ApiPermissionErrors()
export class StrategyController {
  constructor(@Inject(StrategicObjectives) private readonly objectives: StrategicObjectives) {}

  @Get()
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar los objetivos estratégicos y sus indicadores' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: StrategicObjectiveListResponse,
    description: 'Lista',
  })
  async list(@CurrentPrincipal() principal: Principal): Promise<StrategicObjectiveListResponse> {
    return { data: await this.objectives.list(principal) };
  }

  @Post()
  @RequirePermission('qms.indicator.manage')
  @ApiOperation({ summary: 'Registrar un objetivo estratégico' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: StrategicObjectiveCodeResponse,
    description: 'Hecho',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: StrategicObjectiveBody,
  ): Promise<StrategicObjectiveCodeResponse> {
    return this.objectives.create(principal, meta, input);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.indicator.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un objetivo estratégico' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: StrategicObjectiveBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.objectives.update(principal, meta, target, input);
  }

  @Put(':id/indicators')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.indicator.manage')
  @ApiOperation({ summary: 'Asignar los indicadores que miden el objetivo' })
  async link(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: ObjectiveIndicatorsBody,
  ): Promise<void> {
    await this.objectives.linkIndicators(principal, meta, id, input);
  }
}
