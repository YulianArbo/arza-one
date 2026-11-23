import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  contactFormSchema,
  cookieConsentRequestSchema,
  cookieConsentResponseSchema,
  errorResponseSchema,
  formReceiptSchema,
  legalTextKeySchema,
  publicFormInfoSchema,
  publicLegalTextSchema,
  publicPageListResponseSchema,
  publicPageSchema,
  publicPrivacyPolicySchema,
  quoteFormSchema,
  unsubscribeRequestSchema,
  unsubscribeResultSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { SiteForms } from '../application/site-forms.js';
import { SitePublic } from '../application/site-public.js';
import { Submissions } from '../application/submissions.js';
import { webNotFound } from '../application/web-support.js';

class SitePageListResponse extends createZodDto(publicPageListResponseSchema) {}
class SitePageResponse extends createZodDto(publicPageSchema) {}
class SiteLegalTextResponse extends createZodDto(publicLegalTextSchema) {}
class SitePrivacyPolicyResponse extends createZodDto(publicPrivacyPolicySchema) {}
class SiteFormInfoResponse extends createZodDto(publicFormInfoSchema) {}
class SiteContactBody extends createZodDto(contactFormSchema) {}
class SiteQuoteBody extends createZodDto(quoteFormSchema) {}
class SiteFormReceipt extends createZodDto(formReceiptSchema) {}
class SiteCookieConsentBody extends createZodDto(cookieConsentRequestSchema) {}
class SiteCookieConsentResponse extends createZodDto(cookieConsentResponseSchema) {}
class SiteUnsubscribeBody extends createZodDto(unsubscribeRequestSchema) {}
class SiteUnsubscribeResponse extends createZodDto(unsubscribeResultSchema) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class SitePublicErrorResponse extends createZodDto(errorResponseSchema) {}

/** Pocos envíos por minuto desde la misma dirección: sin CAPTCHA todavía (decisión 8). */
const FORM_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const READ_THROTTLE = { default: { limit: 120, ttl: 60_000 } };
const LINK_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  type: SitePublicErrorResponse.Output,
  description: 'No existe o no está publicado',
};
const UNAVAILABLE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  type: SitePublicErrorResponse.Output,
  description: 'El sitio no tiene empresa configurada o falta el texto publicado',
};

/**
 * Sitio público (B41, ficha 17.18): páginas y textos legales publicados, formularios de contacto y
 * cotización, elección de cookies y baja de comunicaciones comerciales, sin sesión. La llave de
 * baja va en el cuerpo de la petición, nunca en la dirección: así no queda en los registros.
 */
@ApiTags('Sitio público')
@Controller('v1/public')
@Public()
@ApiCommonErrors()
export class SitePublicController {
  constructor(
    @Inject(SitePublic) private readonly site: SitePublic,
    @Inject(SiteForms) private readonly forms: SiteForms,
    @Inject(Submissions) private readonly submissions: Submissions,
  ) {}

  @Get('pages')
  @Throttle(READ_THROTTLE)
  @ApiOperation({ summary: 'Páginas publicadas del sitio' })
  @ZodResponse({ status: HttpStatus.OK, type: SitePageListResponse, description: 'Páginas' })
  async pages(): Promise<SitePageListResponse> {
    return this.site.pages();
  }

  @Get('pages/:slug')
  @Throttle(READ_THROTTLE)
  @ApiOperation({ summary: 'Una página publicada, por su dirección' })
  @ZodResponse({ status: HttpStatus.OK, type: SitePageResponse, description: 'Página' })
  @ApiResponse(NOT_FOUND)
  async page(@Param('slug') slug: string): Promise<SitePageResponse> {
    return this.site.page(slug);
  }

  @Get('legal/privacy-policy')
  @Throttle(READ_THROTTLE)
  @ApiOperation({ summary: 'Política de tratamiento de datos personales publicada' })
  @ZodResponse({ status: HttpStatus.OK, type: SitePrivacyPolicyResponse, description: 'Política' })
  @ApiResponse(NOT_FOUND)
  async privacyPolicy(): Promise<SitePrivacyPolicyResponse> {
    return this.site.privacyPolicy();
  }

  @Get('legal/:key')
  @Throttle(READ_THROTTLE)
  @ApiOperation({ summary: 'Versión publicada de un texto legal del sitio' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteLegalTextResponse, description: 'Texto' })
  @ApiResponse(NOT_FOUND)
  async legalText(@Param('key') key: string): Promise<SiteLegalTextResponse> {
    const parsed = legalTextKeySchema.safeParse(key);
    if (!parsed.success) throw webNotFound('Ese texto legal no existe.');
    return this.site.legalText(parsed.data);
  }

  @Get('forms/notice')
  @Throttle(READ_THROTTLE)
  @ApiOperation({ summary: 'Aviso de autorización que acompaña a los formularios' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteFormInfoResponse, description: 'Aviso' })
  async formInfo(): Promise<SiteFormInfoResponse> {
    return this.forms.info();
  }

  @Post('forms/contact')
  @Throttle(FORM_THROTTLE)
  @ApiOperation({
    summary: 'Enviar el formulario de contacto',
    description: 'Crea el prospecto con su autorización; el acuse llega por correo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: SiteFormReceipt, description: 'Recibido' })
  @ApiResponse(UNAVAILABLE)
  async contact(
    @Body() body: SiteContactBody,
    @Meta() meta: RequestMeta,
  ): Promise<SiteFormReceipt> {
    return this.forms.contact(body, meta);
  }

  @Post('forms/quote')
  @Throttle(FORM_THROTTLE)
  @ApiOperation({
    summary: 'Solicitar una cotización',
    description: 'Crea el prospecto con su autorización; el acuse llega por correo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: SiteFormReceipt, description: 'Recibida' })
  @ApiResponse(UNAVAILABLE)
  async quote(@Body() body: SiteQuoteBody, @Meta() meta: RequestMeta): Promise<SiteFormReceipt> {
    return this.forms.quote(body, meta);
  }

  @Post('cookie-consent')
  @Throttle(READ_THROTTLE)
  @ApiOperation({
    summary: 'Registrar la elección de cookies',
    description: 'Con la versión de la política, las categorías y la dirección IP truncada.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: SiteCookieConsentResponse,
    description: 'Registrada',
  })
  @ApiResponse(UNAVAILABLE)
  async cookieConsent(
    @Body() body: SiteCookieConsentBody,
    @Meta() meta: RequestMeta,
  ): Promise<SiteCookieConsentResponse> {
    return this.site.cookieConsent(body, meta);
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle(LINK_THROTTLE)
  @ApiOperation({
    summary: 'Darse de baja de las comunicaciones comerciales',
    description: 'Con la llave del correo de acuse, en un clic y sin sesión.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SiteUnsubscribeResponse, description: 'Baja' })
  @ApiResponse(NOT_FOUND)
  async unsubscribe(
    @Body() body: SiteUnsubscribeBody,
    @Meta() meta: RequestMeta,
  ): Promise<SiteUnsubscribeResponse> {
    return this.submissions.unsubscribe(body, meta);
  }
}
