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
  convertLeadRequestSchema,
  createLeadRequestSchema,
  discardLeadRequestSchema,
  leadDetailSchema,
  leadListQuerySchema,
  leadListResponseSchema,
  noticeListResponseSchema,
  updateLeadRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { publishedAuthorizationNotices } from '../../privacy/index.js';
import { LeadQueries } from '../application/lead-queries.js';
import { LeadsUseCase } from '../application/leads.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class LeadListQuery extends createZodDto(leadListQuerySchema) {}
class LeadListResponse extends createZodDto(leadListResponseSchema) {}
class LeadDetailResponse extends createZodDto(leadDetailSchema) {}
class CreateLeadRequest extends createZodDto(createLeadRequestSchema) {}
class UpdateLeadRequest extends createZodDto(updateLeadRequestSchema) {}
class DiscardLeadRequest extends createZodDto(discardLeadRequestSchema) {}
class ConvertLeadRequest extends createZodDto(convertLeadRequestSchema) {}
class LeadNoticesResponse extends createZodDto(noticeListResponseSchema) {}

/** Prospectos del CRM (M05, B22; ficha 17.6): nuevo → calificado → convertido o descartado. */
@ApiTags('Comercial')
@Controller('v1/crm/leads')
@ApiPermissionErrors()
export class LeadsController {
  constructor(
    @Inject(LeadQueries) private readonly queries: LeadQueries,
    @Inject(LeadsUseCase) private readonly leads: LeadsUseCase,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  @RequirePermission('crm.lead.read')
  @Get()
  @ApiOperation({ summary: 'Prospectos, del más reciente al más antiguo, con búsqueda y filtros' })
  @ZodResponse({ status: HttpStatus.OK, type: LeadListResponse, description: 'Prospectos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: LeadListQuery,
  ): Promise<LeadListResponse> {
    return this.queries.list(principal, query);
  }

  @RequirePermission('crm.lead.create')
  @Get('authorization-notices')
  @ApiOperation({
    summary: 'Textos de autorización vigentes para el formulario del prospecto',
    description: 'Todo prospecto guarda su autorización de tratamiento y la finalidad (B17).',
  })
  @ZodResponse({ status: HttpStatus.OK, type: LeadNoticesResponse, description: 'Textos' })
  async notices(@CurrentPrincipal() principal: Principal): Promise<LeadNoticesResponse> {
    const data = await this.database.withTenant(principal, publishedAuthorizationNotices);
    return { data };
  }

  @RequirePermission('crm.lead.create')
  @Post()
  @ApiOperation({
    summary: 'Registrar un prospecto',
    description:
      'Con una persona registrada o una nueva (queda como tercero prospecto), su autorización y la tarea «Contactar al prospecto».',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Registrado' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateLeadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.leads.create(principal, body, meta) };
  }

  @RequirePermission('crm.lead.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha del prospecto' })
  @ZodResponse({ status: HttpStatus.OK, type: LeadDetailResponse, description: 'Prospecto' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<LeadDetailResponse> {
    return this.queries.detail(principal, id);
  }

  @RequirePermission('crm.lead.update')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar el prospecto', description: 'Solo si sigue abierto.' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateLeadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.leads.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('crm.lead.update')
  @Post(':id/actions/qualify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Calificar el prospecto', description: 'Cierra su tarea de contacto.' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Calificado' })
  @ApiCrmWriteErrors()
  async qualify(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.leads.qualify({ principal, ability, meta }, target);
  }

  @RequirePermission('crm.lead.update')
  @Post(':id/actions/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Descartar el prospecto', description: 'Con su motivo.' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Descartado' })
  @ApiCrmWriteErrors()
  async discard(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DiscardLeadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.leads.discard({ principal, ability, meta }, target, body);
  }

  @RequirePermission('crm.lead.convert')
  @Post(':id/actions/convert')
  @ApiOperation({
    summary: 'Convertir el prospecto en oportunidad',
    description: 'Solo un prospecto calificado. Devuelve el id de la oportunidad nueva.',
  })
  @ApiCrmIfMatch()
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Convertido' })
  @ApiCrmWriteErrors()
  async convert(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ConvertLeadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return { id: await this.leads.convert(principal, target, body, meta) };
  }
}
