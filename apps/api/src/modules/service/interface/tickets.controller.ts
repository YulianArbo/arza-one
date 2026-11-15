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
  assignTicketRequestSchema,
  createTicketRequestSchema,
  escalateTicketRequestSchema,
  reopenTicketRequestSchema,
  resolveTicketRequestSchema,
  ticketDetailSchema,
  ticketListQuerySchema,
  ticketListResponseSchema,
  ticketOptionsSchema,
  updateTicketRequestSchema,
  waitTicketRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TicketQueries } from '../application/ticket-queries.js';
import { TicketStepsUseCase } from '../application/ticket-steps.js';
import { TicketsUseCase } from '../application/tickets.js';
import {
  ApiServiceIfMatch,
  ApiServiceWriteErrors,
  ServiceCreatedResponse,
  UUID,
} from './service-openapi.js';

class TicketListQuery extends createZodDto(ticketListQuerySchema) {}
class TicketListResponse extends createZodDto(ticketListResponseSchema) {}
class TicketDetailResponse extends createZodDto(ticketDetailSchema) {}
class TicketOptionsResponse extends createZodDto(ticketOptionsSchema) {}
class CreateTicketRequest extends createZodDto(createTicketRequestSchema) {}
class UpdateTicketRequest extends createZodDto(updateTicketRequestSchema) {}
class AssignTicketRequest extends createZodDto(assignTicketRequestSchema) {}
class EscalateTicketRequest extends createZodDto(escalateTicketRequestSchema) {}
class WaitTicketRequest extends createZodDto(waitTicketRequestSchema) {}
class ResolveTicketRequest extends createZodDto(resolveTicketRequestSchema) {}
class ReopenTicketRequest extends createZodDto(reopenTicketRequestSchema) {}

/** Tiquetes de la mesa de ayuda: bandeja, ficha, registro y recorrido (M08, B28; ficha 17.9). */
@ApiTags('Servicio')
@Controller('v1/tickets')
@ApiPermissionErrors()
export class TicketsController {
  constructor(
    @Inject(TicketQueries) private readonly queries: TicketQueries,
    @Inject(TicketsUseCase) private readonly tickets: TicketsUseCase,
    @Inject(TicketStepsUseCase) private readonly steps: TicketStepsUseCase,
  ) {}

  @RequirePermission('service.ticket.read')
  @Get()
  @ApiOperation({
    summary: 'Bandeja de tiquetes',
    description: 'Por vista; lo que vence primero, arriba. Cada quien ve lo que le corresponde.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: TicketListResponse, description: 'Tiquetes' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: TicketListQuery,
  ): Promise<TicketListResponse> {
    return this.queries.list(principal, ability, query);
  }

  @RequirePermission('service.ticket.assign')
  @Get('options')
  @ApiOperation({ summary: 'A quién se asigna', description: 'Servicio y Líder técnico activos.' })
  @ZodResponse({ status: HttpStatus.OK, type: TicketOptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<TicketOptionsResponse> {
    return this.queries.options(principal);
  }

  @RequirePermission('service.ticket.create')
  @Post()
  @ApiOperation({
    summary: 'Registrar un tiquete',
    description: 'Arranca el reloj de su acuerdo de tiempo; uno crítico avisa de inmediato.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ServiceCreatedResponse, description: 'Creado' })
  @ApiServiceWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceCreatedResponse> {
    return { id: await this.tickets.create(principal, ability, body, meta) };
  }

  @RequirePermission('service.ticket.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha del tiquete', description: 'Con su reloj y lo que puede hacer.' })
  @ZodResponse({ status: HttpStatus.OK, type: TicketDetailResponse, description: 'Tiquete' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<TicketDetailResponse> {
    return this.queries.detail(principal, ability, id);
  }

  @RequirePermission('service.ticket.assign')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar un tiquete',
    description: 'Cambiar la prioridad recalcula los vencimientos con el plazo ya consumido.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiServiceWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.tickets.update(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.assign')
  @Post(':id/actions/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Asignar', description: 'A Servicio al cliente o al Líder técnico.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Asignado' })
  @ApiServiceWriteErrors()
  async assign(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AssignTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.assign(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.assign')
  @Post(':id/actions/escalate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Escalar', description: 'Sube un nivel y reasigna, con su motivo.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Escalado' })
  @ApiServiceWriteErrors()
  async escalate(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: EscalateTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.escalate(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.resolve')
  @Post(':id/actions/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Empezar', description: 'El tiquete asignado pasa a «En curso».' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En curso' })
  @ApiServiceWriteErrors()
  async start(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.start(principal, ability, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('service.ticket.resolve')
  @Post(':id/actions/wait')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Poner en espera del cliente',
    description: 'Pausa el reloj; la nota opcional va al cliente.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En espera' })
  @ApiServiceWriteErrors()
  async wait(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: WaitTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.wait(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.resolve')
  @Post(':id/actions/resume')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reanudar', description: 'El reloj sigue con lo que le quedaba.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En curso' })
  @ApiServiceWriteErrors()
  async resume(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.resume(principal, ability, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('service.ticket.resolve')
  @Post(':id/actions/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Resolver',
    description: 'Con la solución; se cierra solo en cinco días hábiles si nadie lo reabre.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Resuelto' })
  @ApiServiceWriteErrors()
  async resolve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ResolveTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.resolve(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.read')
  @Post(':id/actions/reopen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reabrir',
    description: 'Quien atiende o quien lo pidió, mientras esté resuelto.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En curso' })
  @ApiServiceWriteErrors()
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReopenTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.reopen(principal, ability, target, body, meta);
  }

  @RequirePermission('service.ticket.close')
  @Post(':id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar', description: 'Un tiquete resuelto.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cerrado' })
  @ApiServiceWriteErrors()
  async close(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.close(principal, ability, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }
}
