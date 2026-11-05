import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptQuoteRequestSchema,
  errorResponseSchema,
  publicQuoteRequestSchema,
  publicQuoteSchema,
  rejectQuoteRequestSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { PublicQuotesUseCase } from '../application/quote-public.js';

class PublicQuoteRequest extends createZodDto(publicQuoteRequestSchema) {}
class PublicQuoteResponse extends createZodDto(publicQuoteSchema) {}
class AcceptQuoteRequest extends createZodDto(acceptQuoteRequestSchema) {}
class RejectQuoteRequest extends createZodDto(rejectQuoteRequestSchema) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PublicQuoteErrorResponse extends createZodDto(errorResponseSchema) {}

/** Pocas peticiones por minuto: la llave no se adivina probando. */
const LINK_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

const LINK_NOT_VALID = {
  status: HttpStatus.NOT_FOUND,
  type: PublicQuoteErrorResponse.Output,
  description: 'El enlace no existe o se reemplazó por uno más reciente',
};

/**
 * El cliente abre la cotización desde el enlace del correo, sin sesión (B23, anexo D). La llave va
 * en el cuerpo de la petición, nunca en la dirección: así no queda en los registros.
 */
@ApiTags('Cotización del cliente')
@Controller('v1/public/quotes')
@Public()
@Throttle(LINK_THROTTLE)
@ApiCommonErrors()
export class PublicQuotesController {
  constructor(@Inject(PublicQuotesUseCase) private readonly quotes: PublicQuotesUseCase) {}

  @Post('view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ver la cotización',
    description: 'Con su estado para el cliente. Queda registrado que la abrió.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PublicQuoteResponse, description: 'Cotización' })
  @ApiResponse(LINK_NOT_VALID)
  async view(
    @Body() body: PublicQuoteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PublicQuoteResponse> {
    return this.quotes.view(body.token, meta);
  }

  @Post('pdf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descargar el PDF FT-COM-001' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: HttpStatus.OK, description: 'El PDF' })
  @ApiResponse(LINK_NOT_VALID)
  async pdf(
    @Body() body: PublicQuoteRequest,
    @Res({ passthrough: true }) response: Response,
    @Meta() meta: RequestMeta,
  ): Promise<StreamableFile> {
    const file = await this.quotes.pdf(body.token, meta);
    response.attachment(file.fileName);
    return new StreamableFile(file.content, { type: file.mimeType, length: file.sizeBytes });
  }

  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aceptar la cotización',
    description: 'Queda la evidencia: fecha y hora, IP, navegador, versión y huella del PDF.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aceptada' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: PublicQuoteErrorResponse.Output,
    description: 'Vencida (QUOTE_EXPIRED), ya respondida o reemplazada',
  })
  async accept(@Body() body: AcceptQuoteRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.quotes.accept(body, meta);
  }

  @Post('reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechazar la cotización', description: 'El motivo es opcional.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazada' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: PublicQuoteErrorResponse.Output,
    description: 'Vencida, ya respondida o reemplazada',
  })
  async reject(@Body() body: RejectQuoteRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.quotes.reject(body, meta);
  }
}
