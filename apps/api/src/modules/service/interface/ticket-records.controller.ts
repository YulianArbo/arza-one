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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  compensationApplyRequestSchema,
  compensationDecisionRequestSchema,
  compensationListResponseSchema,
  compensationRequestSchema,
  ticketMessageListResponseSchema,
  ticketMessageRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CompensationsUseCase } from '../application/compensations.js';
import { TicketMessagesUseCase } from '../application/ticket-messages.js';
import {
  ApiServiceIfMatch,
  ApiServiceWriteErrors,
  ServiceCreatedResponse,
  UUID,
} from './service-openapi.js';

class MessageRequest extends createZodDto(ticketMessageRequestSchema) {}
class MessageListResponse extends createZodDto(ticketMessageListResponseSchema) {}
class CompensationRequest extends createZodDto(compensationRequestSchema) {}
class CompensationListResponse extends createZodDto(compensationListResponseSchema) {}
class CompensationDecisionRequest extends createZodDto(compensationDecisionRequestSchema) {}
class CompensationApplyRequest extends createZodDto(compensationApplyRequestSchema) {}

/** Conversación y compensaciones RE-SAC-001 de un tiquete (M08, B28). */
@ApiTags('Servicio')
@Controller('v1/tickets/:id')
@ApiPermissionErrors()
export class TicketRecordsController {
  constructor(
    @Inject(TicketMessagesUseCase) private readonly messages: TicketMessagesUseCase,
    @Inject(CompensationsUseCase) private readonly compensations: CompensationsUseCase,
  ) {}

  @RequirePermission('service.ticket.read')
  @Get('messages')
  @ApiOperation({
    summary: 'Conversación',
    description: 'Las notas internas solo las ve quien ve todos los tiquetes.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: MessageListResponse, description: 'Mensajes' })
  async listMessages(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<MessageListResponse> {
    return { data: await this.messages.list(principal, ability, id) };
  }

  @RequirePermission('service.ticket.read')
  @Post('messages')
  @ApiOperation({
    summary: 'Escribir en la conversación',
    description:
      'Mensaje al cliente o nota interna; la respuesta del cliente reanuda el reloj. No se edita.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ServiceCreatedResponse, description: 'Creado' })
  @ApiServiceWriteErrors()
  async addMessage(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: MessageRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceCreatedResponse> {
    return { id: await this.messages.add(principal, ability, id, body, meta) };
  }

  @RequirePermission('service.ticket.read')
  @Get('compensations')
  @ApiOperation({ summary: 'Compensaciones', description: 'RE-SAC-001; solo para el equipo.' })
  @ZodResponse({ status: HttpStatus.OK, type: CompensationListResponse, description: 'Lista' })
  async listCompensations(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<CompensationListResponse> {
    return { data: await this.compensations.list(principal, ability, id) };
  }

  @RequirePermission('service.ticket.resolve')
  @Post('compensations')
  @ApiOperation({ summary: 'Proponer una compensación', description: 'Otra persona la decide.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ServiceCreatedResponse, description: 'Creada' })
  @ApiServiceWriteErrors()
  async propose(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CompensationRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceCreatedResponse> {
    return { id: await this.compensations.propose(principal, ability, id, body, meta) };
  }

  @RequirePermission('service.compensation.approve')
  @Post('compensations/:compensationId/actions/decide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar o rechazar una compensación',
    description: 'Nadie decide la que propuso. La aprobada queda para Facturación.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Decidida' })
  @ApiServiceWriteErrors()
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) ticketId: string,
    @Param('compensationId', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompensationDecisionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { ticketId, id, version: versionFromIfMatch(ifMatch) };
    await this.compensations.decide(principal, target, body, meta);
  }

  @RequirePermission('service.compensation.approve')
  @Post('compensations/:compensationId/actions/apply')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar que se aplicó', description: 'Con la fecha de aplicación.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aplicada' })
  @ApiServiceWriteErrors()
  async apply(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) ticketId: string,
    @Param('compensationId', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompensationApplyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { ticketId, id, version: versionFromIfMatch(ifMatch) };
    await this.compensations.apply(principal, target, body, meta);
  }
}
