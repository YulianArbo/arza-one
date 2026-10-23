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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  completeCrmActivityRequestSchema,
  createCrmActivityRequestSchema,
  crmActivityListQuerySchema,
  crmActivityListResponseSchema,
  updateCrmActivityRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ActivitiesUseCase } from '../application/activities.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class ActivityListQuery extends createZodDto(crmActivityListQuerySchema) {}
class ActivityListResponse extends createZodDto(crmActivityListResponseSchema) {}
class CreateActivityRequest extends createZodDto(createCrmActivityRequestSchema) {}
class UpdateActivityRequest extends createZodDto(updateCrmActivityRequestSchema) {}
class CompleteActivityRequest extends createZodDto(completeCrmActivityRequestSchema) {}

/**
 * Actividades y recordatorios del CRM (M05, B22). La ruta exige ver prospectos; el caso de uso
 * exige además el permiso del tipo de registro de cada actividad: prospecto u oportunidad.
 */
@ApiTags('Comercial')
@Controller('v1/crm/activities')
@ApiPermissionErrors()
export class ActivitiesController {
  constructor(@Inject(ActivitiesUseCase) private readonly activities: ActivitiesUseCase) {}

  @RequirePermission('crm.lead.read')
  @Get()
  @ApiOperation({
    summary: 'Actividades de un registro o la agenda de la persona',
    description: 'Pendientes por hora (las más próximas primero), hechas o todas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ActivityListResponse, description: 'Actividades' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: ActivityListQuery,
  ): Promise<ActivityListResponse> {
    return this.activities.list(principal, ability, query);
  }

  @RequirePermission('crm.lead.read')
  @Post()
  @ApiOperation({
    summary: 'Agendar una actividad',
    description:
      'De un prospecto o una oportunidad abiertos; su responsable recibe un recordatorio.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Agendada' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateActivityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.activities.create({ principal, ability, meta }, body) };
  }

  @RequirePermission('crm.lead.read')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar una actividad pendiente' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateActivityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.activities.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('crm.lead.read')
  @Post(':id/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar la actividad como hecha', description: 'Con su resultado.' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecha' })
  @ApiCrmWriteErrors()
  async complete(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompleteActivityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.activities.complete({ principal, ability, meta }, target, body);
  }
}
