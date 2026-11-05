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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createProjectRequestSchema,
  projectDetailSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectOptionsSchema,
  projectReasonRequestSchema,
  updateProjectRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ProjectQueries } from '../application/project-queries.js';
import { ProjectsUseCase } from '../application/projects.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class ProjectListQuery extends createZodDto(projectListQuerySchema) {}
class ProjectListResponse extends createZodDto(projectListResponseSchema) {}
class ProjectDetailResponse extends createZodDto(projectDetailSchema) {}
class ProjectOptionsResponse extends createZodDto(projectOptionsSchema) {}
class CreateProjectRequest extends createZodDto(createProjectRequestSchema) {}
class UpdateProjectRequest extends createZodDto(updateProjectRequestSchema) {}
class ProjectReasonRequest extends createZodDto(projectReasonRequestSchema) {}

/** Proyectos (M07, B26; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects')
@ApiPermissionErrors()
export class ProjectsController {
  constructor(
    @Inject(ProjectQueries) private readonly queries: ProjectQueries,
    @Inject(ProjectsUseCase) private readonly projects: ProjectsUseCase,
  ) {}

  @RequirePermission('project.read_member')
  @Get()
  @ApiOperation({
    summary: 'Proyectos',
    description:
      'Los más recientes primero. El Equipo de proyecto ve solo aquellos donde es miembro activo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ProjectListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: ProjectListQuery,
  ): Promise<ProjectListResponse> {
    return this.queries.list(principal, ability, query);
  }

  @RequirePermission('project.create')
  @Get('options')
  @ApiOperation({
    summary: 'Opciones del asistente',
    description: 'Contratos vigentes que aún no tienen proyecto y quién puede entrar al equipo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ProjectOptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<ProjectOptionsResponse> {
    return this.queries.options(principal);
  }

  @RequirePermission('project.create')
  @Post()
  @ApiOperation({
    summary: 'Crear un proyecto',
    description:
      'Desde un contrato vigente o, sin él, para un cliente de Terceros. Código PRY-AAAA-NNNN; el líder queda en el equipo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateProjectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.projects.create(principal, body, meta) };
  }

  @RequirePermission('project.read_member')
  @Get(':id')
  @ApiOperation({
    summary: 'Ficha del proyecto',
    description: 'Con su equipo, hitos, iteraciones, enlaces y avance.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ProjectDetailResponse, description: 'Ficha' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe o no es del proyecto' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<ProjectDetailResponse> {
    return this.queries.detail(principal, ability, id);
  }

  @RequirePermission('project.update')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar el proyecto', description: 'Datos, presupuesto y líder.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateProjectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.projects.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('project.update')
  @Post(':id/actions/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Iniciar el proyecto',
    description: 'Con contrato vigente o con la autorización de la Dirección.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En ejecución' })
  @ApiProjectWriteErrors()
  async start(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.projects.step(principal, target, 'start', null, meta);
  }

  @RequirePermission('project.update')
  @Post(':id/actions/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reanudar el proyecto', description: 'Desde en riesgo o pausado.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En ejecución' })
  @ApiProjectWriteErrors()
  async resume(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.projects.step(principal, target, 'resume', null, meta);
  }

  @RequirePermission('project.update')
  @Post(':id/actions/risk')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar en riesgo', description: 'Con el motivo.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En riesgo' })
  @ApiProjectWriteErrors()
  async risk(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ProjectReasonRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.projects.step(principal, target, 'risk', body, meta);
  }

  @RequirePermission('project.update')
  @Post(':id/actions/pause')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Pausar el proyecto', description: 'Con el motivo.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Pausado' })
  @ApiProjectWriteErrors()
  async pause(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ProjectReasonRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.projects.step(principal, target, 'pause', body, meta);
  }

  @RequirePermission('project.update')
  @Post(':id/actions/request-authorization')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pedir a la Dirección la autorización para iniciar',
    description: 'Sin contrato vigente; la Dirección recibe la tarea en Mis tareas.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Pedida' })
  @ApiProjectWriteErrors()
  async requestAuthorization(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ProjectReasonRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.projects.requestAuthorization(principal, target, body, meta);
  }
}
