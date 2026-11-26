import { Controller, Get, Header, HttpStatus, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  dashboardDataResponseSchema,
  drilldownQuerySchema,
  drilldownResponseSchema,
  scorecardResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Dashboards } from '../application/dashboards.js';

class DashboardDataResponse extends createZodDto(dashboardDataResponseSchema) {}
class DrilldownResponse extends createZodDto(drilldownResponseSchema) {}
class ScorecardResponse extends createZodDto(scorecardResponseSchema) {}
class DrilldownQuery extends createZodDto(drilldownQuerySchema) {}

// Tableros de la Dirección (M16, B46): tablero gerencial, cuadro de mando y tablero de
// cumplimiento. Las cifras sin permiso para su listado de origen llegan sin valor.

@ApiTags('Dirección')
@Controller('v1/dashboards')
@ApiPermissionErrors()
export class DashboardsController {
  constructor(@Inject(Dashboards) private readonly dashboards: Dashboards) {}

  @Get('executive/data')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('dashboard.executive.read')
  @ApiOperation({ summary: 'Cifras del tablero gerencial' })
  @ZodResponse({ status: HttpStatus.OK, type: DashboardDataResponse, description: 'Cifras' })
  async executive(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<DashboardDataResponse> {
    return this.dashboards.executive({ principal, ability });
  }

  @Get('executive/drilldown')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('dashboard.executive.read')
  @ApiOperation({ summary: 'Registros que originan una cifra del tablero gerencial' })
  @ZodResponse({ status: HttpStatus.OK, type: DrilldownResponse, description: 'Registros' })
  async executiveDrilldown(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: DrilldownQuery,
  ): Promise<DrilldownResponse> {
    return this.dashboards.drilldown({ principal, ability }, 'executive', query.figure);
  }

  @Get('compliance/data')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('dashboard.compliance.read')
  @ApiOperation({ summary: 'Cifras del tablero de cumplimiento' })
  @ZodResponse({ status: HttpStatus.OK, type: DashboardDataResponse, description: 'Cifras' })
  async compliance(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<DashboardDataResponse> {
    return this.dashboards.compliance({ principal, ability });
  }

  @Get('compliance/drilldown')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('dashboard.compliance.read')
  @ApiOperation({ summary: 'Registros que originan una cifra del tablero de cumplimiento' })
  @ZodResponse({ status: HttpStatus.OK, type: DrilldownResponse, description: 'Registros' })
  async complianceDrilldown(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: DrilldownQuery,
  ): Promise<DrilldownResponse> {
    return this.dashboards.drilldown({ principal, ability }, 'compliance', query.figure);
  }

  @Get('scorecard/data')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('dashboard.process.read')
  @ApiOperation({ summary: 'Cuadro de mando: objetivos estratégicos y sus indicadores' })
  @ZodResponse({ status: HttpStatus.OK, type: ScorecardResponse, description: 'Cuadro de mando' })
  async scorecard(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<ScorecardResponse> {
    return this.dashboards.scorecard({ principal, ability });
  }
}
