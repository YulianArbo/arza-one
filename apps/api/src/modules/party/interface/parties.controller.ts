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
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addPartyRoleRequestSchema,
  changePartyStatusRequestSchema,
  consentGrantSchema,
  createPartyRequestSchema,
  mergePartiesRequestSchema,
  noticeListResponseSchema,
  partyDetailSchema,
  partyListQuerySchema,
  partyListResponseSchema,
  partyRoleParamsSchema,
  partySearchQuerySchema,
  partySearchResponseSchema,
  timelineQuerySchema,
  timelineResponseSchema,
  updatePartyRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { MergeUseCase } from '../application/merge.js';
import { PartiesUseCase } from '../application/parties.js';
import { PartyConsentsUseCase } from '../application/party-consents.js';
import { PartyQueries } from '../application/party-queries.js';
import { TimelineUseCase } from '../application/timeline.js';
import { ApiIfMatch, ApiPartyWriteErrors, PartyCreatedResponse } from './party-openapi.js';

class PartyListQuery extends createZodDto(partyListQuerySchema) {}
class PartyListResponse extends createZodDto(partyListResponseSchema) {}
class PartySearchQuery extends createZodDto(partySearchQuerySchema) {}
class PartySearchResponse extends createZodDto(partySearchResponseSchema) {}
class PartyDetailResponse extends createZodDto(partyDetailSchema) {}
class CreatePartyRequest extends createZodDto(createPartyRequestSchema) {}
class UpdatePartyRequest extends createZodDto(updatePartyRequestSchema) {}
class ChangePartyStatusRequest extends createZodDto(changePartyStatusRequestSchema) {}
class AddPartyRoleRequest extends createZodDto(addPartyRoleRequestSchema) {}
class MergePartiesRequest extends createZodDto(mergePartiesRequestSchema) {}
class TimelineQuery extends createZodDto(timelineQuerySchema) {}
class TimelineResponse extends createZodDto(timelineResponseSchema) {}
class PartyRoleParams extends createZodDto(partyRoleParamsSchema) {}
class AuthorizationNoticesResponse extends createZodDto(noticeListResponseSchema) {}
class GrantConsentRequest extends createZodDto(consentGrantSchema) {}

/** Ficha única del tercero: listado, duplicados, estado, papeles, fusión y línea de tiempo (M02). */
@ApiTags('Terceros')
@Controller('v1/parties')
@ApiPermissionErrors()
export class PartiesController {
  constructor(
    @Inject(PartyQueries) private readonly queries: PartyQueries,
    @Inject(PartiesUseCase) private readonly parties: PartiesUseCase,
    @Inject(MergeUseCase) private readonly merges: MergeUseCase,
    @Inject(TimelineUseCase) private readonly timelines: TimelineUseCase,
    @Inject(PartyConsentsUseCase) private readonly consents: PartyConsentsUseCase,
  ) {}

  @RequirePermission('party.read')
  @Get()
  @ApiOperation({ summary: 'Terceros, del más reciente al más antiguo, con búsqueda y filtros' })
  @ZodResponse({ status: HttpStatus.OK, type: PartyListResponse, description: 'Terceros' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: PartyListQuery,
  ): Promise<PartyListResponse> {
    return this.queries.list(principal, ability, query);
  }

  @RequirePermission('party.read')
  @Get('search')
  @ApiOperation({
    summary: 'Posibles duplicados',
    description: 'Mismo número de documento, correo, teléfono o nombre (ficha 17.3).',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PartySearchResponse, description: 'Coincidencias' })
  async search(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: PartySearchQuery,
  ): Promise<PartySearchResponse> {
    return this.queries.search(principal, ability, query);
  }

  @RequirePermission('party.read')
  @Get('authorization-notices')
  @ApiOperation({
    summary: 'Textos de autorización vigentes',
    description: 'Los que muestra el formulario de una persona antes de marcar la casilla (B17).',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: AuthorizationNoticesResponse,
    description: 'Textos publicados',
  })
  async authorizationNotices(
    @CurrentPrincipal() principal: Principal,
  ): Promise<AuthorizationNoticesResponse> {
    return { data: await this.consents.notices(principal) };
  }

  @RequirePermission('party.update')
  @Post(':id/consents')
  @ApiOperation({
    summary: 'Registrar una autorización nueva de la persona',
    description: 'Con la versión vigente del texto; por ejemplo, para otra finalidad.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PartyCreatedResponse, description: 'Creada' })
  @ApiPartyWriteErrors()
  async grantConsent(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: GrantConsentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PartyCreatedResponse> {
    return { id: await this.consents.grant(principal, id, body, meta) };
  }

  @RequirePermission('party.create')
  @Post()
  @ApiOperation({
    summary: 'Registrar un tercero',
    description: 'Con documento repetido responde 409 PARTY_DUPLICATE: abra el existente.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PartyCreatedResponse, description: 'Creado' })
  @ApiPartyWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreatePartyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PartyCreatedResponse> {
    return { id: await this.parties.create(principal, body, meta) };
  }

  @RequirePermission('party.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha del tercero' })
  @ZodResponse({ status: HttpStatus.OK, type: PartyDetailResponse, description: 'Tercero' })
  @ApiPartyWriteErrors()
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PartyDetailResponse> {
    return this.queries.detail(principal, ability, id);
  }

  @RequirePermission('party.update')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar los datos del tercero' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiPartyWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePartyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.parties.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('party.update')
  @Post(':id/actions/change-status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar el estado: activar, inactivar, bloquear o desbloquear',
    description: 'Prospecto → activo → inactivo → bloqueado. Bloquear exige el motivo.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Estado cambiado' })
  @ApiPartyWriteErrors()
  async changeStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ChangePartyStatusRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.parties.changeStatus(principal, target, body, meta);
  }

  @RequirePermission('party.update')
  @Post(':id/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Agregar un papel: cliente, proveedor, colaborador, contacto o candidato',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Papel vigente' })
  @ApiPartyWriteErrors()
  async addRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AddPartyRoleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.parties.addRole(principal, id, body.role, meta);
  }

  @RequirePermission('party.update')
  @Delete(':id/roles/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Terminar un papel; queda en el historial' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Papel terminado' })
  @ApiPartyWriteErrors()
  async endRole(
    @CurrentPrincipal() principal: Principal,
    @Param() target: PartyRoleParams,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.parties.endRole(principal, target.id, target.role, meta);
  }

  @RequirePermission('party.merge')
  @Post(':id/merge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Fusionar un duplicado en este tercero',
    description: 'Papeles, contactos, cuentas y conocimiento pasan a este; el duplicado se marca.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Fusionados' })
  @ApiPartyWriteErrors()
  async merge(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MergePartiesRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.merges.merge(principal, id, body.duplicate_id, meta);
  }

  @RequirePermission('party.read')
  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Línea de tiempo del tercero',
    description: 'Solo lo que el rol puede ver; incluye lo de los duplicados fusionados.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: TimelineResponse, description: 'Movimientos' })
  @ApiPartyWriteErrors()
  async timeline(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: TimelineQuery,
  ): Promise<TimelineResponse> {
    return this.timelines.timeline(principal, ability, id, query);
  }
}
