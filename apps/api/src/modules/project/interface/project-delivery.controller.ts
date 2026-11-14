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
  codeReviewListQuerySchema,
  codeReviewListResponseSchema,
  codeReviewRequestSchema,
  deliverableListResponseSchema,
  deliverableRequestSchema,
  deliverRequestSchema,
  deliveryOptionsSchema,
  downloadLinkResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CodeReviewsUseCase } from '../application/code-reviews.js';
import { DeliverablesUseCase } from '../application/deliverables.js';
import { DeliveryQueries } from '../application/delivery-queries.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class DeliverableRequest extends createZodDto(deliverableRequestSchema) {}
class DeliverRequest extends createZodDto(deliverRequestSchema) {}
class DeliverableListResponse extends createZodDto(deliverableListResponseSchema) {}
class DeliveryOptionsResponse extends createZodDto(deliveryOptionsSchema) {}
class ActaLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class CodeReviewRequest extends createZodDto(codeReviewRequestSchema) {}
class CodeReviewListQuery extends createZodDto(codeReviewListQuerySchema) {}
class CodeReviewListResponse extends createZodDto(codeReviewListResponseSchema) {}

/** Entregables, actas de entrega y revisiones de código de un proyecto (M07, B27; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id')
@ApiPermissionErrors()
export class ProjectDeliveryController {
  constructor(
    @Inject(DeliveryQueries) private readonly queries: DeliveryQueries,
    @Inject(DeliverablesUseCase) private readonly deliverables: DeliverablesUseCase,
    @Inject(CodeReviewsUseCase) private readonly reviews: CodeReviewsUseCase,
  ) {}

  @RequirePermission('project.read_member')
  @Get('deliverables')
  @ApiOperation({ summary: 'Entregables', description: 'Con la última entrega y su acta.' })
  @ZodResponse({ status: HttpStatus.OK, type: DeliverableListResponse, description: 'Entregables' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DeliverableListResponse> {
    return { data: await this.queries.list(principal, ability, id) };
  }

  @RequirePermission('project.read_member')
  @Get('deliverables/options')
  @ApiOperation({
    summary: 'Opciones para entregar',
    description:
      'Firmantes autorizados del cliente, plazo de respuesta y si el acta está publicada.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DeliveryOptionsResponse, description: 'Opciones' })
  async options(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DeliveryOptionsResponse> {
    return this.queries.options(principal, ability, id);
  }

  @RequirePermission('project.item.manage')
  @Post('deliverables')
  @ApiOperation({ summary: 'Crear un entregable', description: 'Queda en preparación.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: DeliverableRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.deliverables.create({ principal, ability, meta }, id, body) };
  }

  @RequirePermission('project.item.manage')
  @Put('deliverables/:deliverableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Corregir un entregable', description: 'En preparación o devuelto.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('deliverableId', UUID) deliverableId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DeliverableRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: deliverableId, version: versionFromIfMatch(ifMatch) };
    await this.deliverables.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('project.deliverable.submit')
  @Post('deliverables/:deliverableId/actions/deliver')
  @ApiOperation({
    summary: 'Entregar al cliente',
    description:
      'Llena el acta FT-TEC-001; en segundos sale a firma de la persona del cliente (enlace y código).',
  })
  @ApiProjectIfMatch()
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Acta' })
  @ApiProjectWriteErrors()
  async deliver(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('deliverableId', UUID) deliverableId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DeliverRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    const target = { projectId, id: deliverableId, version: versionFromIfMatch(ifMatch) };
    return { id: await this.deliverables.deliver({ principal, ability, meta }, target, body) };
  }

  @RequirePermission('project.read_member')
  @Post('deliverables/:deliverableId/acta-link')
  @ApiOperation({
    summary: 'Enlace para descargar el acta',
    description: 'La firmada si el cliente ya firmó; si no, la enviada. Queda en la auditoría.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ActaLinkResponse, description: 'Enlace' })
  @ApiProjectWriteErrors()
  async actaLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('deliverableId', UUID) deliverableId: string,
    @Meta() meta: RequestMeta,
  ): Promise<ActaLinkResponse> {
    return this.queries.actaLink(principal, ability, { projectId, id: deliverableId }, meta);
  }

  @RequirePermission('project.read_member')
  @Get('code-reviews')
  @ApiOperation({ summary: 'Revisiones de código', description: 'Con su registro FT-TEC-002.' })
  @ZodResponse({ status: HttpStatus.OK, type: CodeReviewListResponse, description: 'Revisiones' })
  async listReviews(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Query() query: CodeReviewListQuery,
  ): Promise<CodeReviewListResponse> {
    return { data: await this.reviews.list(principal, ability, id, query) };
  }

  @RequirePermission('project.item.manage')
  @Post('code-reviews')
  @ApiOperation({
    summary: 'Registrar una revisión de código',
    description: 'Lista FT-TEC-002 punto por punto; quien hizo el ítem no se revisa a sí mismo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creada' })
  @ApiProjectWriteErrors()
  async createReview(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CodeReviewRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.reviews.create({ principal, ability, meta }, id, body) };
  }
}
