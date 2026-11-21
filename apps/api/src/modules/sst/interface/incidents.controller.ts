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
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  attendUnsafeReportSchema,
  closeIncidentSchema,
  completeInvestigationActionSchema,
  investigationPlanSchema,
  reportToArlSchema,
  sstIncidentDetailSchema,
  sstIncidentListResponseSchema,
  startInvestigationSchema,
  unsafeReportListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Incidents } from '../application/incidents.js';
import { UnsafeReports } from '../application/unsafe-reports.js';

class SstIncidentListResponse extends createZodDto(sstIncidentListResponseSchema) {}
class SstIncidentResponse extends createZodDto(sstIncidentDetailSchema) {}
class SstUnsafeListResponse extends createZodDto(unsafeReportListResponseSchema) {}
class SstAttendBody extends createZodDto(attendUnsafeReportSchema) {}
class SstArlBody extends createZodDto(reportToArlSchema) {}
class SstInvestigateBody extends createZodDto(startInvestigationSchema) {}
class SstPlanBody extends createZodDto(investigationPlanSchema) {}
class SstCloseBody extends createZodDto(closeIncidentSchema) {}
class SstCompleteActionBody extends createZodDto(completeInvestigationActionSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Incidentes, accidentes e investigación; actos y condiciones inseguras (B37, decisiones 5 y 6).

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst')
@ApiPermissionErrors()
export class IncidentsController {
  constructor(
    @Inject(Incidents) private readonly incidents: Incidents,
    @Inject(UnsafeReports) private readonly reports: UnsafeReports,
  ) {}

  @Get('unsafe-reports')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar los actos y condiciones inseguras reportados' })
  @ZodResponse({ status: HttpStatus.OK, type: SstUnsafeListResponse, description: 'Reportes' })
  async listReports(@CurrentPrincipal() principal: Principal): Promise<SstUnsafeListResponse> {
    return { data: await this.reports.list(principal) };
  }

  @Post('unsafe-reports/:id/actions/attend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.investigate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Atender un reporte de acto o condición insegura' })
  async attend(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstAttendBody,
  ): Promise<void> {
    await this.reports.attend(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('incidents')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar los incidentes y accidentes de trabajo' })
  @ZodResponse({ status: HttpStatus.OK, type: SstIncidentListResponse, description: 'Incidentes' })
  async list(@CurrentPrincipal() principal: Principal): Promise<SstIncidentListResponse> {
    return { data: await this.incidents.list(principal) };
  }

  @Get('incidents/:id')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar un incidente con su investigación y acciones' })
  @ZodResponse({ status: HttpStatus.OK, type: SstIncidentResponse, description: 'Incidente' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<SstIncidentResponse> {
    return this.incidents.detail(principal, id);
  }

  @Post('incidents/:id/actions/report-arl')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.investigate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar el reporte del accidente a la ARL con su radicado' })
  async reportArl(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstArlBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.incidents.reportArl(principal, meta, target, input);
  }

  @Post('incidents/:id/actions/investigate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.investigate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Abrir la investigación con el equipo que investiga' })
  async investigate(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstInvestigateBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.incidents.investigate(principal, meta, target, input);
  }

  @Post('incidents/:id/actions/plan')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.investigate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar las causas y el plan de acción' })
  async plan(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstPlanBody,
  ): Promise<void> {
    await this.incidents.plan(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('incidents/:id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.close')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cerrar el incidente con sus acciones terminadas' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstCloseBody,
  ): Promise<void> {
    await this.incidents.close(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      input,
    );
  }

  @Post('investigation-actions/:id/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.report')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Marcar hecha una acción del plan (su responsable o SST)' })
  async completeAction(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstCompleteActionBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.incidents.completeAction({ principal, ability }, meta, target, input);
  }
}
