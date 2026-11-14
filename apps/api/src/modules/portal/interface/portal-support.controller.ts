import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  portalArticleListSchema,
  portalArticleQuerySchema,
  portalArticleSchema,
  portalPqrsfFiledSchema,
  portalPqrsfListSchema,
  portalPqrsfRequestSchema,
  portalTicketDetailSchema,
  portalTicketListSchema,
  portalTicketReplySchema,
  portalTicketRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PortalActions } from '../application/portal-actions.js';
import { PortalQueries } from '../application/portal-queries.js';
import {
  ApiPortalErrors,
  ApiPortalWriteErrors,
  PortalCreatedResponse,
  UUID,
} from './portal-openapi.js';

class PortalTicketListResponse extends createZodDto(portalTicketListSchema) {}
class PortalTicketDetailResponse extends createZodDto(portalTicketDetailSchema) {}
class PortalTicketRequest extends createZodDto(portalTicketRequestSchema) {}
class PortalTicketReply extends createZodDto(portalTicketReplySchema) {}
class PortalPqrsfListResponse extends createZodDto(portalPqrsfListSchema) {}
class PortalPqrsfRequest extends createZodDto(portalPqrsfRequestSchema) {}
class PortalPqrsfFiledResponse extends createZodDto(portalPqrsfFiledSchema) {}
class PortalArticleQuery extends createZodDto(portalArticleQuerySchema) {}
class PortalArticleListResponse extends createZodDto(portalArticleListSchema) {}
class PortalArticleResponse extends createZodDto(portalArticleSchema) {}

/**
 * Soporte en el portal del cliente (M09 con M08, B30): tiquetes con su conversación pública,
 * PQRSF y artículos de ayuda para clientes. Las notas internas del equipo nunca salen aquí.
 */
@ApiTags('Portal del cliente')
@Controller('v1/portal')
@ApiPermissionErrors()
@ApiPortalErrors()
export class PortalSupportController {
  constructor(
    @Inject(PortalQueries) private readonly queries: PortalQueries,
    @Inject(PortalActions) private readonly actions: PortalActions,
  ) {}

  @RequirePermission('portal.ticket.read')
  @Get('tickets')
  @ApiOperation({
    summary: 'Mis solicitudes de soporte',
    description: 'El usuario ve las que pidió; el administrador, las de su empresa.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalTicketListResponse, description: 'Tiquetes' })
  async tickets(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalTicketListResponse> {
    return this.queries.tickets({ principal, ability });
  }

  @RequirePermission('portal.ticket.create')
  @Post('tickets')
  @ApiOperation({
    summary: 'Pedir soporte',
    description: 'Registra un tiquete a su nombre y arranca el reloj de su acuerdo de tiempo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PortalCreatedResponse, description: 'Creado' })
  @ApiPortalWriteErrors()
  async createTicket(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: PortalTicketRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PortalCreatedResponse> {
    return { id: await this.actions.createTicket({ principal, ability, meta }, body) };
  }

  @RequirePermission('portal.ticket.read')
  @Get('tickets/:id')
  @ApiOperation({
    summary: 'Una solicitud de soporte',
    description: 'Con los mensajes públicos; nunca las notas internas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalTicketDetailResponse, description: 'Tiquete' })
  async ticket(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<PortalTicketDetailResponse> {
    return this.queries.ticket({ principal, ability }, id);
  }

  @RequirePermission('portal.ticket.create')
  @Post('tickets/:id/messages')
  @ApiOperation({
    summary: 'Responder',
    description: 'Si el tiquete esperaba su respuesta, el reloj vuelve a correr.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PortalCreatedResponse, description: 'Enviado' })
  @ApiPortalWriteErrors()
  async reply(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: PortalTicketReply,
    @Meta() meta: RequestMeta,
  ): Promise<PortalCreatedResponse> {
    return { id: await this.actions.reply({ principal, ability, meta }, id, body.body) };
  }

  @RequirePermission('portal.ticket.read')
  @Get('pqrsf')
  @ApiOperation({
    summary: 'Mis PQRSF',
    description: 'Las que usted radicó, con su plazo y la respuesta cuando se envió.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalPqrsfListResponse, description: 'PQRSF' })
  async pqrsf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalPqrsfListResponse> {
    return this.queries.pqrsf({ principal, ability });
  }

  @RequirePermission('portal.ticket.create')
  @Post('pqrsf')
  @ApiOperation({
    summary: 'Radicar una PQRSF',
    description: 'Con los datos de su cuenta; el acuse con el radicado llega a su correo.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PortalPqrsfFiledResponse,
    description: 'Radicada',
  })
  @ApiPortalWriteErrors()
  async filePqrsf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: PortalPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PortalPqrsfFiledResponse> {
    return this.actions.filePqrsf({ principal, ability, meta }, body);
  }

  @RequirePermission('portal.ticket.read')
  @Get('articles')
  @ApiOperation({ summary: 'Artículos de ayuda', description: 'Los publicados para clientes.' })
  @ZodResponse({ status: HttpStatus.OK, type: PortalArticleListResponse, description: 'Artículos' })
  async articles(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: PortalArticleQuery,
  ): Promise<PortalArticleListResponse> {
    return this.queries.articles({ principal, ability }, query.q);
  }

  @RequirePermission('portal.ticket.read')
  @Get('articles/:id')
  @ApiOperation({ summary: 'Un artículo de ayuda', description: 'Publicado para clientes.' })
  @ZodResponse({ status: HttpStatus.OK, type: PortalArticleResponse, description: 'Artículo' })
  async article(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<PortalArticleResponse> {
    return this.queries.article({ principal, ability }, id);
  }
}
