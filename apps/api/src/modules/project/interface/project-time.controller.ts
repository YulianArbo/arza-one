import {
  Body,
  Controller,
  Delete,
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
  approveTimeRequestSchema,
  returnTimeRequestSchema,
  timeEntryRequestSchema,
  timeListQuerySchema,
  timeListResponseSchema,
  timeOptionsSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TimeEntriesUseCase } from '../application/time-entries.js';
import { TimeQueries } from '../application/time-queries.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class TimeEntryRequest extends createZodDto(timeEntryRequestSchema) {}
class ApproveTimeRequest extends createZodDto(approveTimeRequestSchema) {}
class ReturnTimeRequest extends createZodDto(returnTimeRequestSchema) {}
class TimeListQuery extends createZodDto(timeListQuerySchema) {}
class TimeListResponse extends createZodDto(timeListResponseSchema) {}
class TimeOptionsResponse extends createZodDto(timeOptionsSchema) {}
class ApprovedTimeResponse extends createZodDto(
  z.object({ approved: z.number().int().describe('Registros aprobados') }),
) {}

/** Horas de un proyecto (M07, B27; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id/time-entries')
@ApiPermissionErrors()
export class ProjectTimeController {
  constructor(
    @Inject(TimeQueries) private readonly queries: TimeQueries,
    @Inject(TimeEntriesUseCase) private readonly entries: TimeEntriesUseCase,
  ) {}

  @RequirePermission('project.read_member')
  @Get()
  @ApiOperation({
    summary: 'Horas del proyecto',
    description: 'Quien aprueba ve todas; los demás, solo las suyas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: TimeListResponse, description: 'Horas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Query() query: TimeListQuery,
  ): Promise<TimeListResponse> {
    return this.queries.ofProject(principal, ability, id, query);
  }

  @RequirePermission('project.time.log')
  @Post()
  @ApiOperation({
    summary: 'Registrar horas',
    description: 'Del equipo; en cuartos de hora, con máximo siete días de atraso.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async log(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: TimeEntryRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.entries.log({ principal, ability, meta }, id, body) };
  }

  @RequirePermission('project.time.log')
  @Put(':entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Corregir una hora propia',
    description: 'Mientras no esté aprobada; una devuelta vuelve a quedar por aprobar.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('entryId', UUID) entryId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: TimeEntryRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: entryId, version: versionFromIfMatch(ifMatch) };
    await this.entries.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('project.time.log')
  @Delete(':entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar una hora propia', description: 'Mientras no esté aprobada.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Borrado' })
  @ApiProjectWriteErrors()
  async remove(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('entryId', UUID) entryId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: entryId, version: versionFromIfMatch(ifMatch) };
    await this.entries.remove({ principal, ability, meta }, target);
  }

  @RequirePermission('project.time.approve')
  @Post('actions/approve')
  @ApiOperation({
    summary: 'Aprobar horas',
    description: 'Varias a la vez; nunca las propias.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ApprovedTimeResponse, description: 'Aprobadas' })
  @ApiProjectWriteErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: ApproveTimeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ApprovedTimeResponse> {
    return { approved: await this.entries.approve({ principal, ability, meta }, id, body) };
  }

  @RequirePermission('project.time.approve')
  @Post(':entryId/actions/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Devolver una hora', description: 'Con lo que hay que corregir.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelta' })
  @ApiProjectWriteErrors()
  async returnEntry(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('entryId', UUID) entryId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReturnTimeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: entryId, version: versionFromIfMatch(ifMatch) };
    await this.entries.returnEntry({ principal, ability, meta }, target, body);
  }
}

/** «Mis horas»: las de la persona en todos sus proyectos (B27). */
@ApiTags('Proyectos')
@Controller('v1/time-entries')
@ApiPermissionErrors()
export class MyTimeController {
  constructor(@Inject(TimeQueries) private readonly queries: TimeQueries) {}

  @RequirePermission('project.time.log')
  @Get('mine')
  @ApiOperation({ summary: 'Mis horas', description: 'En todos mis proyectos.' })
  @ZodResponse({ status: HttpStatus.OK, type: TimeListResponse, description: 'Horas' })
  async mine(
    @CurrentPrincipal() principal: Principal,
    @Query() query: TimeListQuery,
  ): Promise<TimeListResponse> {
    return this.queries.mine(principal, query);
  }

  @RequirePermission('project.time.log')
  @Get('options')
  @ApiOperation({
    summary: 'Dónde puedo registrar',
    description: 'Mis proyectos abiertos con sus ítems y el día más antiguo permitido.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: TimeOptionsResponse, description: 'Opciones' })
  async options(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<TimeOptionsResponse> {
    return this.queries.options(principal, ability);
  }
}
