import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { acceptPlatformTermsSchema, platformTermsStatusSchema } from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { OwnAccount } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { PlatformTerms } from '../application/platform-terms.js';

class SitePlatformTermsResponse extends createZodDto(platformTermsStatusSchema) {}
class SiteAcceptTermsBody extends createZodDto(acceptPlatformTermsSchema) {}

/**
 * Términos de uso de la plataforma de la persona que ingresa (B41, decisión 3). Son rutas de la
 * cuenta propia: se atienden aunque la sesión esté esperando la aceptación.
 */
@ApiTags('Mi cuenta')
@Controller('v1/me/platform-terms')
@OwnAccount()
@ApiCommonErrors()
export class PlatformTermsController {
  constructor(@Inject(PlatformTerms) private readonly terms: PlatformTerms) {}

  @Get()
  @ApiOperation({ summary: 'Versión vigente de los términos y si falta aceptarla' })
  @ZodResponse({ status: HttpStatus.OK, type: SitePlatformTermsResponse, description: 'Estado' })
  async status(@CurrentPrincipal() principal: Principal): Promise<SitePlatformTermsResponse> {
    return this.terms.status(principal);
  }

  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Aceptar la versión vigente que leyó' })
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: SiteAcceptTermsBody,
  ): Promise<void> {
    await this.terms.accept(principal, meta, input);
  }
}
