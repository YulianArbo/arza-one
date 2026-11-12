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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  purchaseOptionsResponseSchema,
  purchaseRequestListResponseSchema,
  rejectPurchaseSchema,
  savePurchaseRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PurchaseRequestsUseCase } from '../application/requests.js';
import {
  CONFLICT,
  IF_MATCH,
  INVALID,
  NOT_FOUND,
  PurCreatedResponse,
  UUID,
} from './purchase-http.js';

class RequestListResponse extends createZodDto(purchaseRequestListResponseSchema) {}
class OptionsResponse extends createZodDto(purchaseOptionsResponseSchema) {}
class SaveRequest extends createZodDto(savePurchaseRequestSchema) {}
class RejectRequest extends createZodDto(rejectPurchaseSchema) {}

@ApiTags('Compras')
@Controller('v1/purchase-requests')
@ApiPermissionErrors()
export class PurchaseRequestsController {
  constructor(
    @Inject(PurchaseRequestsUseCase) private readonly requests: PurchaseRequestsUseCase,
  ) {}

  @RequirePermission('purchase.read')
  @Get()
  @ApiOperation({ summary: 'Solicitudes de compra de la empresa, con su cuadro comparativo' })
  @ZodResponse({ status: HttpStatus.OK, type: RequestListResponse, description: 'Solicitudes' })
  async list(@CurrentPrincipal() principal: Principal): Promise<RequestListResponse> {
    return { data: await this.requests.list(principal) };
  }

  @RequirePermission('purchase.request.create')
  @Get('mine')
  @ApiOperation({ summary: 'Solicitudes de compra de la persona' })
  @ZodResponse({ status: HttpStatus.OK, type: RequestListResponse, description: 'Mis solicitudes' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<RequestListResponse> {
    return { data: await this.requests.mine(principal) };
  }

  @RequirePermission('purchase.request.create')
  @Get('options')
  @ApiOperation({ summary: 'Centros de costo, proveedores y topes vigentes para los formularios' })
  @ZodResponse({ status: HttpStatus.OK, type: OptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<OptionsResponse> {
    return { data: await this.requests.options(principal) };
  }

  @RequirePermission('purchase.request.create')
  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Crear una solicitud de compra, en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Solicitud' })
  @ApiResponse(INVALID)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: SaveRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    return {
      id: await this.requests.create({ principal, meta }, idempotencyKeyFrom(header), body),
    };
  }

  @RequirePermission('purchase.request.create')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar una solicitud propia en borrador' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SaveRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.requests.update({ principal, meta }, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('purchase.request.create')
  @Post(':id/submission')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Enviar una solicitud propia a aprobación' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Enviada' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.requests.submit({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('purchase.request.approve')
  @Post(':id/approval')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({
    summary: 'Aprobar una solicitud (otra persona que quien la pidió; el tramo alto, la Dirección)',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobada' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const highApproval = hasPermission(ability, 'purchase.request.approve_high');
    await this.requests.approve({ principal, meta, highApproval }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('purchase.request.approve')
  @Post(':id/rejection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Rechazar una solicitud con su motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazada' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.requests.reject({ principal, meta }, id, versionFromIfMatch(ifMatch), body.reason);
  }
}
