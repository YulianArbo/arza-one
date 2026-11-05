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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  approveQuoteRequestSchema,
  createQuoteRequestSchema,
  downloadLinkResponseSchema,
  quoteDetailSchema,
  quoteListQuerySchema,
  quoteListResponseSchema,
  quoteOptionsSchema,
  returnQuoteRequestSchema,
  sendQuoteRequestSchema,
  updateQuoteRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { QuoteQueries } from '../application/quote-queries.js';
import { QuotesUseCase } from '../application/quotes.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class QuoteListQuery extends createZodDto(quoteListQuerySchema) {}
class QuoteListResponse extends createZodDto(quoteListResponseSchema) {}
class QuoteDetailResponse extends createZodDto(quoteDetailSchema) {}
class QuoteOptionsResponse extends createZodDto(quoteOptionsSchema) {}
class QuotePdfLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class CreateQuoteRequest extends createZodDto(createQuoteRequestSchema) {}
class UpdateQuoteRequest extends createZodDto(updateQuoteRequestSchema) {}
class ApproveQuoteRequest extends createZodDto(approveQuoteRequestSchema) {}
class ReturnQuoteRequest extends createZodDto(returnQuoteRequestSchema) {}
class SendQuoteRequest extends createZodDto(sendQuoteRequestSchema) {}

/** Cotizaciones (M05, B23; ficha 17.6). */
@ApiTags('Comercial')
@Controller('v1/crm/quotes')
@ApiPermissionErrors()
export class QuotesController {
  constructor(
    @Inject(QuoteQueries) private readonly queries: QuoteQueries,
    @Inject(QuotesUseCase) private readonly quotes: QuotesUseCase,
  ) {}

  @RequirePermission('crm.quote.read')
  @Get()
  @ApiOperation({
    summary: 'Cotizaciones',
    description: 'Las más recientes primero; por defecto, solo la última versión de cada una.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: QuoteListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: QuoteListQuery,
  ): Promise<QuoteListResponse> {
    return this.queries.list(principal, query);
  }

  @RequirePermission('crm.quote.create')
  @Get('options')
  @ApiOperation({
    summary: 'Opciones del asistente',
    description: 'Servicios activos, impuestos con tarifa vigente y el tope de descuento.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: QuoteOptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<QuoteOptionsResponse> {
    return this.queries.options(principal);
  }

  @RequirePermission('crm.quote.create')
  @Post()
  @ApiOperation({
    summary: 'Crear una cotización en borrador',
    description: 'Para una oportunidad abierta; código COT-AAAA-NNNN, versión 1.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Creada' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.quotes.create(principal, body, meta) };
  }

  @RequirePermission('crm.quote.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha de la cotización', description: 'Con sus ítems y versiones.' })
  @ZodResponse({ status: HttpStatus.OK, type: QuoteDetailResponse, description: 'Ficha' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<QuoteDetailResponse> {
    return this.queries.detail(principal, id);
  }

  @RequirePermission('crm.quote.update')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Guardar el borrador',
    description: 'Encabezado e ítems juntos. Una cotización fuera de borrador no se edita.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.quotes.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('crm.quote.update')
  @Post(':id/actions/submit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pedir el envío',
    description:
      'Si algún descuento pasa el tope, va a la Dirección; si no, queda aprobada y se prepara su PDF.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Pedido' })
  @ApiCrmWriteErrors()
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.quotes.submit(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('crm.quote.approve')
  @Post(':id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar (Dirección)',
    description: 'Quien la elaboró no la aprueba. Cierra la tarea de Mis tareas.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobada' })
  @ApiCrmWriteErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ApproveQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.quotes.approve({ principal, ability, meta }, target, body);
  }

  @RequirePermission('crm.quote.approve')
  @Post(':id/actions/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Devolver para corregir (Dirección)',
    description: 'Vuelve a borrador con el comentario. Quien la elaboró no la devuelve.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelta' })
  @ApiCrmWriteErrors()
  async returnToDraft(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReturnQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.quotes.returnToDraft({ principal, ability, meta }, target, body);
  }

  @RequirePermission('crm.quote.send')
  @Post(':id/actions/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Enviar al cliente',
    description:
      'Solo una aprobada, con su PDF listo y vigente. El cliente recibe un correo con el enlace.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Enviada' })
  @ApiCrmWriteErrors()
  async send(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SendQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.quotes.send(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('crm.quote.create')
  @Post(':id/actions/new-version')
  @ApiOperation({
    summary: 'Crear la versión siguiente',
    description:
      'Copia la cotización como borrador; una enviada o aprobada queda reemplazada y su enlace ya no sirve.',
  })
  @ApiCrmIfMatch()
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Creada' })
  @ApiCrmWriteErrors()
  async newVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return { id: await this.quotes.newVersion(principal, target, meta) };
  }

  @RequirePermission('crm.quote.read')
  @Post(':id/pdf')
  @ApiOperation({
    summary: 'Enlace para descargar el PDF FT-COM-001',
    description: 'Enlace temporal; existe desde que la versión queda aprobada.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: QuotePdfLinkResponse, description: 'Enlace' })
  @ApiCrmWriteErrors()
  async pdf(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<QuotePdfLinkResponse> {
    return this.queries.pdfLink(principal, id, meta);
  }
}
