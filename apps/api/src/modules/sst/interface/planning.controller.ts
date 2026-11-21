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
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  completeWorkPlanItemSchema,
  hazardListResponseSchema,
  saveHazardSchema,
  saveWorkPlanItemSchema,
  sstCreatedResponseSchema,
  workPlanQuerySchema,
  workPlanResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Hazards } from '../application/hazards.js';
import { WorkPlan } from '../application/work-plan.js';

class HazardListResponse extends createZodDto(hazardListResponseSchema) {}
class HazardBody extends createZodDto(saveHazardSchema) {}
class WorkPlanResponse extends createZodDto(workPlanResponseSchema) {}
class WorkPlanQuery extends createZodDto(workPlanQuerySchema) {}
class WorkPlanItemBody extends createZodDto(saveWorkPlanItemSchema) {}
class CompleteItemBody extends createZodDto(completeWorkPlanItemSchema) {}
class CreatedResponse extends createZodDto(sstCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Matriz de peligros (GTC 45) y plan anual de trabajo del SG-SST (B37, decisiones 3 y 14).

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst')
@ApiPermissionErrors()
export class PlanningController {
  constructor(
    @Inject(Hazards) private readonly hazards: Hazards,
    @Inject(WorkPlan) private readonly plan: WorkPlan,
  ) {}

  @Get('hazards')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar la matriz de peligros, del riesgo más alto al más bajo' })
  @ZodResponse({ status: HttpStatus.OK, type: HazardListResponse, description: 'Matriz' })
  async listHazards(@CurrentPrincipal() principal: Principal): Promise<HazardListResponse> {
    return { data: await this.hazards.list(principal) };
  }

  @Post('hazards')
  @RequirePermission('sst.hazard.manage')
  @ApiOperation({ summary: 'Agregar un peligro; la plataforma calcula el nivel de riesgo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Agregado' })
  async createHazard(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: HazardBody,
  ): Promise<CreatedResponse> {
    return { id: await this.hazards.create(principal, meta, input) };
  }

  @Patch('hazards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.hazard.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un peligro y su valoración' })
  async updateHazard(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: HazardBody,
  ): Promise<void> {
    await this.hazards.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('work-plan')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar el plan anual con su porcentaje de cumplimiento' })
  @ZodResponse({ status: HttpStatus.OK, type: WorkPlanResponse, description: 'Plan' })
  async listPlan(
    @CurrentPrincipal() principal: Principal,
    @Query() query: WorkPlanQuery,
  ): Promise<WorkPlanResponse> {
    return this.plan.list(principal, query.year);
  }

  @Post('work-plan')
  @RequirePermission('sst.plan.manage')
  @ApiOperation({ summary: 'Agregar una actividad al plan anual' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Agregada' })
  async createItem(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: WorkPlanItemBody,
  ): Promise<CreatedResponse> {
    return { id: await this.plan.create(principal, meta, input) };
  }

  @Post('work-plan/:id/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.plan.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Dar por hecha una actividad con su evidencia' })
  async completeItem(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CompleteItemBody,
  ): Promise<void> {
    await this.plan.complete(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }
}
