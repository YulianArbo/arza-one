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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addPurchaseQuoteSchema,
  createSupplierEvaluationSchema,
  purchaseOrderListResponseSchema,
  registerReceiptSchema,
  supplierEvaluationListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PurchaseOrdersUseCase } from '../application/orders.js';
import { PurchaseQuotesUseCase } from '../application/quotes.js';
import { SupplierEvaluationsUseCase } from '../application/supplier-evaluations.js';
import {
  CONFLICT,
  IF_MATCH,
  INVALID,
  NOT_FOUND,
  PurCreatedResponse,
  UUID,
} from './purchase-http.js';

class OrderListResponse extends createZodDto(purchaseOrderListResponseSchema) {}
class EvaluationListResponse extends createZodDto(supplierEvaluationListResponseSchema) {}
class AddQuote extends createZodDto(addPurchaseQuoteSchema) {}
class RegisterReceipt extends createZodDto(registerReceiptSchema) {}
class CreateEvaluation extends createZodDto(createSupplierEvaluationSchema) {}

const REQUEST_IF_MATCH = { ...IF_MATCH, description: 'Versión de la solicitud de compra' };

/** Cotizaciones y cuadro comparativo de una solicitud aprobada. */
@ApiTags('Compras')
@Controller('v1')
@ApiPermissionErrors()
export class PurchaseQuotesController {
  constructor(@Inject(PurchaseQuotesUseCase) private readonly quotes: PurchaseQuotesUseCase) {}

  @RequirePermission('purchase.order.issue')
  @Post('purchase-requests/:id/quotes')
  @ApiOperation({ summary: 'Agregar la cotización de un proveedor a una solicitud aprobada' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Cotización' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async add(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: AddQuote,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    return { id: await this.quotes.add({ principal, meta }, id, body) };
  }

  @RequirePermission('purchase.order.issue')
  @Delete('purchase-quotes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar una cotización que no es la elegida' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Quitada' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.quotes.remove({ principal, meta }, id);
  }

  @RequirePermission('purchase.order.issue')
  @Post('purchase-quotes/:id/selection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(REQUEST_IF_MATCH)
  @ApiOperation({
    summary: 'Elegir la cotización ganadora; exige las cotizaciones mínimas del tramo',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Elegida' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async select(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.quotes.select({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }
}

/** Órdenes de compra, recepciones y cierre. */
@ApiTags('Compras')
@Controller('v1')
@ApiPermissionErrors()
export class PurchaseOrdersController {
  constructor(@Inject(PurchaseOrdersUseCase) private readonly orders: PurchaseOrdersUseCase) {}

  @RequirePermission('purchase.read')
  @Get('purchase-orders')
  @ApiOperation({ summary: 'Órdenes de compra con sus recepciones' })
  @ZodResponse({ status: HttpStatus.OK, type: OrderListResponse, description: 'Órdenes' })
  async list(@CurrentPrincipal() principal: Principal): Promise<OrderListResponse> {
    return { data: await this.orders.list(principal) };
  }

  @RequirePermission('purchase.order.issue')
  @Post('purchase-requests/:id/order')
  @ApiHeader(REQUEST_IF_MATCH)
  @ApiOperation({
    summary: 'Emitir la orden al proveedor elegido, con conocimiento del tercero vigente',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Orden' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async issue(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    return { id: await this.orders.issue({ principal, meta }, id, versionFromIfMatch(ifMatch)) };
  }

  @RequirePermission('purchase.order.receive')
  @Post('purchase-orders/:id/receipts')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar la recepción (otra persona que quien pidió la compra)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Recepción' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async receive(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: RegisterReceipt,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    const key = idempotencyKeyFrom(header);
    return { id: await this.orders.receive({ principal, meta }, id, key, body) };
  }

  @RequirePermission('purchase.order.issue')
  @Post('purchase-orders/:id/closure')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cerrar una orden recibida conforme' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cerrada' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.orders.close({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }
}

/** Selección, evaluación y reevaluación de proveedores. */
@ApiTags('Compras')
@Controller('v1/supplier-evaluations')
@ApiPermissionErrors()
export class SupplierEvaluationsController {
  constructor(
    @Inject(SupplierEvaluationsUseCase) private readonly evaluations: SupplierEvaluationsUseCase,
  ) {}

  @RequirePermission('purchase.read')
  @Get()
  @ApiOperation({ summary: 'Evaluaciones de proveedores' })
  @ZodResponse({ status: HttpStatus.OK, type: EvaluationListResponse, description: 'Evaluaciones' })
  async list(@CurrentPrincipal() principal: Principal): Promise<EvaluationListResponse> {
    return { data: await this.evaluations.list(principal) };
  }

  @RequirePermission('purchase.supplier.evaluate')
  @Post()
  @ApiOperation({ summary: 'Evaluar o reevaluar un proveedor en un periodo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Evaluación' })
  @ApiResponse(INVALID)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateEvaluation,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    return { id: await this.evaluations.create({ principal, meta }, body) };
  }
}
