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
  createOpportunityRequestSchema,
  loseOpportunityRequestSchema,
  moveOpportunityRequestSchema,
  opportunityDetailSchema,
  opportunityListQuerySchema,
  opportunityListResponseSchema,
  updateOpportunityRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { OpportunitiesUseCase } from '../application/opportunities.js';
import { OpportunityQueries } from '../application/opportunity-queries.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class OpportunityListQuery extends createZodDto(opportunityListQuerySchema) {}
class OpportunityListResponse extends createZodDto(opportunityListResponseSchema) {}
class OpportunityDetailResponse extends createZodDto(opportunityDetailSchema) {}
class CreateOpportunityRequest extends createZodDto(createOpportunityRequestSchema) {}
class UpdateOpportunityRequest extends createZodDto(updateOpportunityRequestSchema) {}
class MoveOpportunityRequest extends createZodDto(moveOpportunityRequestSchema) {}
class LoseOpportunityRequest extends createZodDto(loseOpportunityRequestSchema) {}

/** Embudo de oportunidades (M05, B22; ficha 17.6). */
@ApiTags('Comercial')
@Controller('v1/crm/opportunities')
@ApiPermissionErrors()
export class OpportunitiesController {
  constructor(
    @Inject(OpportunityQueries) private readonly queries: OpportunityQueries,
    @Inject(OpportunitiesUseCase) private readonly opportunities: OpportunitiesUseCase,
  ) {}

  @RequirePermission('crm.opportunity.read')
  @Get()
  @ApiOperation({
    summary: 'Oportunidades del embudo',
    description: 'Abiertas por fecha esperada de cierre (el tablero), cerradas o todas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: OpportunityListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: OpportunityListQuery,
  ): Promise<OpportunityListResponse> {
    return this.queries.list(principal, query);
  }

  @RequirePermission('crm.opportunity.create')
  @Post()
  @ApiOperation({
    summary: 'Registrar una oportunidad',
    description: 'Para un cliente de Terceros.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Registrada' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateOpportunityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.opportunities.create(principal, body, meta) };
  }

  @RequirePermission('crm.opportunity.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha de la oportunidad' })
  @ZodResponse({ status: HttpStatus.OK, type: OpportunityDetailResponse, description: 'Ficha' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<OpportunityDetailResponse> {
    return this.queries.detail(principal, id);
  }

  @RequirePermission('crm.opportunity.update')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar la oportunidad', description: 'Solo si sigue abierta.' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateOpportunityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.opportunities.update(principal, target, body, meta);
  }

  @RequirePermission('crm.opportunity.update')
  @Post(':id/actions/move')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar de etapa',
    description:
      'Avanzar o retroceder entre las etapas abiertas; sin probabilidad, la de la etapa.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Movida' })
  @ApiCrmWriteErrors()
  async move(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: MoveOpportunityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.opportunities.move(principal, target, body, meta);
  }

  @RequirePermission('crm.opportunity.close')
  @Post(':id/actions/win')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Marcar como ganada',
    description: 'El cliente queda activo y con el papel de cliente; debe tener su documento.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Ganada' })
  @ApiCrmWriteErrors()
  async win(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.opportunities.win(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('crm.opportunity.close')
  @Post(':id/actions/lose')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar como perdida', description: 'Exige el motivo (ficha 17.6).' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Perdida' })
  @ApiCrmWriteErrors()
  async lose(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: LoseOpportunityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.opportunities.lose(principal, target, body, meta);
  }
}
