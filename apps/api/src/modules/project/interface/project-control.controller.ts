import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  closeProjectRequestSchema,
  controlSettingsRequestSchema,
  downloadLinkResponseSchema,
  incidentListResponseSchema,
  incidentRequestSchema,
  indicatorsSchema,
  releaseListResponseSchema,
  releaseRequestSchema,
  resolveIncidentRequestSchema,
  riskListResponseSchema,
  riskRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ClosingUseCase } from '../application/closing.js';
import { ControlQueries } from '../application/control-queries.js';
import { IncidentsUseCase } from '../application/incidents.js';
import { RisksReleasesUseCase } from '../application/risks-releases.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class RiskRequest extends createZodDto(riskRequestSchema) {}
class RiskListResponse extends createZodDto(riskListResponseSchema) {}
class ReleaseRequest extends createZodDto(releaseRequestSchema) {}
class ReleaseListResponse extends createZodDto(releaseListResponseSchema) {}
class ReportLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class IncidentRequest extends createZodDto(incidentRequestSchema) {}
class ResolveIncidentRequest extends createZodDto(resolveIncidentRequestSchema) {}
class IncidentListResponse extends createZodDto(incidentListResponseSchema) {}
class IndicatorsResponse extends createZodDto(indicatorsSchema) {}
class ControlSettingsRequest extends createZodDto(controlSettingsRequestSchema) {}
class CloseProjectRequest extends createZodDto(closeProjectRequestSchema) {}

/** Riesgos, liberaciones, incidentes, indicadores y cierre de un proyecto (M07, B27; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id')
@ApiPermissionErrors()
export class ProjectControlController {
  constructor(
    @Inject(ControlQueries) private readonly queries: ControlQueries,
    @Inject(RisksReleasesUseCase) private readonly control: RisksReleasesUseCase,
    @Inject(IncidentsUseCase) private readonly incidents: IncidentsUseCase,
    @Inject(ClosingUseCase) private readonly closing: ClosingUseCase,
  ) {}

  @RequirePermission('project.read_member')
  @Get('indicators')
  @ApiOperation({
    summary: 'Indicadores del proyecto',
    description: 'Avance, horas, desviación y, para quien ve todos los proyectos, rentabilidad.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: IndicatorsResponse, description: 'Indicadores' })
  async indicators(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<IndicatorsResponse> {
    return this.queries.indicators(principal, ability, id);
  }

  @RequirePermission('project.read_member')
  @Get('risks')
  @ApiOperation({ summary: 'Riesgos', description: 'Con su nivel calculado.' })
  @ZodResponse({ status: HttpStatus.OK, type: RiskListResponse, description: 'Riesgos' })
  async risks(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<RiskListResponse> {
    return { data: await this.queries.risks(principal, ability, id) };
  }

  @RequirePermission('project.update')
  @Post('risks')
  @ApiOperation({ summary: 'Registrar un riesgo', description: 'Uno alto avisa al líder.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async createRisk(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: RiskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.control.createRisk(principal, id, body, meta) };
  }

  @RequirePermission('project.update')
  @Put('risks/:riskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Actualizar un riesgo', description: 'Incluso cerrarlo.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async updateRisk(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('riskId', UUID) riskId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RiskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: riskId, version: versionFromIfMatch(ifMatch) };
    await this.control.updateRisk(principal, target, body, meta);
  }

  @RequirePermission('project.read_member')
  @Get('releases')
  @ApiOperation({ summary: 'Liberaciones', description: 'Con su informe de pruebas.' })
  @ZodResponse({ status: HttpStatus.OK, type: ReleaseListResponse, description: 'Liberaciones' })
  async releases(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<ReleaseListResponse> {
    return { data: await this.queries.releases(principal, ability, id) };
  }

  @RequirePermission('project.release.manage')
  @Post('releases')
  @ApiOperation({
    summary: 'Registrar una liberación',
    description: 'Con el informe de pruebas en PDF (PR-TEC-003); no se edita.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creada' })
  @ApiProjectWriteErrors()
  async createRelease(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: ReleaseRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.control.createRelease(principal, id, body, meta) };
  }

  @RequirePermission('project.read_member')
  @Post('releases/:releaseId/report-link')
  @ApiOperation({
    summary: 'Enlace para descargar el informe de pruebas',
    description: 'Enlace temporal que queda en la auditoría.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ReportLinkResponse, description: 'Enlace' })
  @ApiProjectWriteErrors()
  async reportLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('releaseId', UUID) releaseId: string,
    @Meta() meta: RequestMeta,
  ): Promise<ReportLinkResponse> {
    return this.queries.releaseReportLink(principal, ability, { projectId, id: releaseId }, meta);
  }

  @RequirePermission('project.read_member')
  @Get('incidents')
  @ApiOperation({ summary: 'Incidentes', description: 'Registro FT-TEC-004 del proyecto.' })
  @ZodResponse({ status: HttpStatus.OK, type: IncidentListResponse, description: 'Incidentes' })
  async listIncidents(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<IncidentListResponse> {
    return { data: await this.queries.incidents(principal, ability, id) };
  }

  @RequirePermission('project.incident.manage')
  @Post('incidents')
  @ApiOperation({
    summary: 'Registrar un incidente',
    description: 'Código INC-AAAA-NNNN; con datos personales, avisa al Oficial de datos.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async reportIncident(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: IncidentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.incidents.report(principal, id, body, meta) };
  }

  @RequirePermission('project.incident.manage')
  @Post('incidents/:incidentId/actions/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resolver un incidente', description: 'Con causa raíz y acciones.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Resuelto' })
  @ApiProjectWriteErrors()
  async resolveIncident(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('incidentId', UUID) incidentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ResolveIncidentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: incidentId, version: versionFromIfMatch(ifMatch) };
    await this.incidents.resolve(principal, target, body, meta);
  }

  @RequirePermission('project.update')
  @Put('control-settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Configurar el control',
    description: 'Costo de la hora, plazo del cliente para las actas y aceptación tácita.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async settings(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ControlSettingsRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.closing.updateSettings(
      principal,
      { id, version: versionFromIfMatch(ifMatch) },
      body,
      meta,
    );
  }

  @RequirePermission('project.close')
  @Post('actions/start-closing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Pasar a cierre', description: 'Desde en ejecución o en riesgo.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En cierre' })
  @ApiProjectWriteErrors()
  async startClosing(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.closing.startClosing(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('project.close')
  @Post('actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar el proyecto',
    description: 'Con entregables aceptados, sin incidentes abiertos ni horas por aprobar.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cerrado' })
  @ApiProjectWriteErrors()
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CloseProjectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.closing.close(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }
}
