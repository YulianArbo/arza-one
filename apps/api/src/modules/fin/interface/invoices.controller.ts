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
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  billableMilestonesResponseSchema,
  createCreditNoteSchema,
  createPaymentSchema,
  errorResponseSchema,
  invoiceCreatedResponseSchema,
  invoiceDetailEnvelopeSchema,
  invoiceListResponseSchema,
  registerFiscalInvoiceSchema,
  requestInvoiceSchema,
  voidInvoiceSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { InvoicesUseCase } from '../application/invoices.js';

class InvoiceListResponse extends createZodDto(invoiceListResponseSchema) {}
class InvoiceDetailResponse extends createZodDto(invoiceDetailEnvelopeSchema) {}
class BillableMilestonesResponse extends createZodDto(billableMilestonesResponseSchema) {}
class InvoiceCreatedResponse extends createZodDto(invoiceCreatedResponseSchema) {}
class RequestInvoice extends createZodDto(requestInvoiceSchema) {}
class RegisterFiscalInvoice extends createZodDto(registerFiscalInvoiceSchema) {}
class CreateCreditNote extends createZodDto(createCreditNoteSchema) {}
class CreatePayment extends createZodDto(createPaymentSchema) {}
class VoidInvoice extends createZodDto(voidInvoiceSchema) {}
class FinErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', description: 'Versión de la factura', required: true };

@ApiTags('Finanzas')
@Controller('v1/finance/invoices')
@ApiPermissionErrors()
export class InvoicesController {
  constructor(@Inject(InvoicesUseCase) private readonly invoices: InvoicesUseCase) {}

  @RequirePermission('finance.invoice.read')
  @Get()
  @ApiOperation({ summary: 'Facturas y solicitudes' })
  @ZodResponse({ status: HttpStatus.OK, type: InvoiceListResponse, description: 'Facturas' })
  async list(@CurrentPrincipal() principal: Principal): Promise<InvoiceListResponse> {
    return { data: await this.invoices.list(principal) };
  }

  @RequirePermission('finance.invoice.request')
  @Get('billable-milestones')
  @ApiOperation({ summary: 'Hitos listos para solicitar factura' })
  @ZodResponse({ status: HttpStatus.OK, type: BillableMilestonesResponse, description: 'Hitos' })
  async billableMilestones(
    @CurrentPrincipal() principal: Principal,
  ): Promise<BillableMilestonesResponse> {
    return { data: await this.invoices.availableMilestones(principal) };
  }

  @RequirePermission('finance.invoice.read')
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una factura' })
  @ZodResponse({ status: HttpStatus.OK, type: InvoiceDetailResponse, description: 'Factura' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: FinErrorResponse.Output,
    description: 'No existe',
  })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<InvoiceDetailResponse> {
    return { data: await this.invoices.detail(principal, id) };
  }

  @RequirePermission('finance.invoice.request')
  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Solicitar factura desde un hito aceptado' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: InvoiceCreatedResponse,
    description: 'Solicitud',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: FinErrorResponse.Output,
    description: 'Hito no facturable',
  })
  async request(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: RequestInvoice,
    @Meta() meta: RequestMeta,
  ): Promise<InvoiceCreatedResponse> {
    return {
      id: await this.invoices.request(
        { principal, meta },
        body.milestone_id,
        idempotencyKeyFrom(header),
      ),
    };
  }

  @RequirePermission('finance.invoice.approve')
  @Post(':id/approval')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiIdempotencyKey()
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar una solicitud de factura' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobada' })
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') header: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.invoices.approve(
      { principal, meta },
      id,
      versionFromIfMatch(ifMatch),
      idempotencyKeyFrom(header),
    );
  }

  @RequirePermission('finance.invoice.register_fiscal')
  @Post(':id/fiscal-document')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiIdempotencyKey()
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar los valores y el soporte de la factura fiscal emitida' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Documento registrado' })
  async registerFiscal(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: RegisterFiscalInvoice,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.invoices.registerFiscal(
      { principal, meta },
      id,
      versionFromIfMatch(ifMatch),
      idempotencyKeyFrom(header),
      body,
    );
  }

  @RequirePermission('finance.invoice.void')
  @Post(':id/void')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Anular una solicitud antes de emitirla' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Solicitud anulada' })
  async void(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VoidInvoice,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.invoices.void({ principal, meta }, id, versionFromIfMatch(ifMatch), body.reason);
  }

  @RequirePermission('finance.invoice.register_fiscal')
  @Post(':id/credit-notes')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una nota crédito emitida' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: InvoiceCreatedResponse,
    description: 'Nota crédito',
  })
  async createCreditNote(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: CreateCreditNote,
    @Meta() meta: RequestMeta,
  ): Promise<InvoiceCreatedResponse> {
    return {
      id: await this.invoices.createCreditNote(
        { principal, meta },
        id,
        idempotencyKeyFrom(header),
        body,
      ),
    };
  }

  @RequirePermission('finance.payment.manage')
  @Post(':id/payments')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar un recaudo aplicado a la factura' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InvoiceCreatedResponse, description: 'Recaudo' })
  async createPayment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: CreatePayment,
    @Meta() meta: RequestMeta,
  ): Promise<InvoiceCreatedResponse> {
    return {
      id: await this.invoices.createPayment(
        { principal, meta },
        id,
        idempotencyKeyFrom(header),
        body,
      ),
    };
  }
}
