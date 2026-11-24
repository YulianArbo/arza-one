import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  errorResponseSchema,
  portalPrivacyRequestListSchema,
  portalPrivacyRequestSchema,
  privacyRequestReceiptSchema,
  publicPrivacyRequestSchema,
  publicPrivacyStatusRequestSchema,
  publicPrivacyStatusSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public, RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import {
  ApiCommonErrors,
  ApiPermissionErrors,
} from '../../../platform/openapi/api-common-errors.js';
import { PublicRequestsUseCase } from '../application/request-public.js';

class PublicPrivacyRequestBody extends createZodDto(publicPrivacyRequestSchema) {}
class PortalPrivacyRequestBody extends createZodDto(portalPrivacyRequestSchema) {}
class PrivacyRequestReceiptResponse extends createZodDto(privacyRequestReceiptSchema) {}
class PublicPrivacyStatusBody extends createZodDto(publicPrivacyStatusRequestSchema) {}
class PublicPrivacyStatusResponse extends createZodDto(publicPrivacyStatusSchema) {}
class PortalPrivacyRequestList extends createZodDto(portalPrivacyRequestListSchema) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PrivacyPublicErrorResponse extends createZodDto(errorResponseSchema) {}

/** Pocos envíos por minuto desde la misma dirección, como los demás formularios públicos. */
const FORM_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
const STATUS_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

const UNAVAILABLE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  type: PrivacyPublicErrorResponse.Output,
  description: 'El sitio no tiene empresa configurada',
};
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  type: PrivacyPublicErrorResponse.Output,
  description: 'El código y el correo no coinciden',
};

/**
 * Derechos del titular en el sitio público (B42, decisión 1; Ley 1581, arts. 14 y 15): presentar
 * una consulta o un reclamo sin sesión y consultar su estado con el código y el correo.
 */
@ApiTags('Sitio público')
@Controller('v1/public/privacy-requests')
@Public()
@ApiCommonErrors()
export class PublicPrivacyRequestsController {
  constructor(@Inject(PublicRequestsUseCase) private readonly requests: PublicRequestsUseCase) {}

  @Post()
  @Throttle(FORM_THROTTLE)
  @ApiOperation({
    summary: 'Presentar una consulta o un reclamo sobre sus datos personales',
    description: 'Responde el código y la fecha límite; la constancia llega por correo.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PrivacyRequestReceiptResponse,
    description: 'Recibida',
  })
  @ApiResponse(UNAVAILABLE)
  async file(
    @Body() body: PublicPrivacyRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyRequestReceiptResponse> {
    return this.requests.filePublic(body, meta);
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @Throttle(STATUS_THROTTLE)
  @ApiOperation({
    summary: 'Consultar el estado de una solicitud',
    description: 'Con el código y el correo con que se presentó; el código va en el cuerpo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PublicPrivacyStatusResponse, description: 'Estado' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(UNAVAILABLE)
  async status(
    @Body() body: PublicPrivacyStatusBody,
    @Meta() meta: RequestMeta,
  ): Promise<PublicPrivacyStatusResponse> {
    return this.requests.publicStatus(body, meta);
  }
}

/** «Mis datos y privacidad» del portal del cliente (B42, decisión 1). */
@ApiTags('Portal del cliente')
@Controller('v1/portal/me/privacy-requests')
@RequirePermission('portal.personal_data.manage')
@ApiPermissionErrors()
export class PortalPrivacyRequestsController {
  constructor(@Inject(PublicRequestsUseCase) private readonly requests: PublicRequestsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Mis solicitudes sobre mis datos personales' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PortalPrivacyRequestList,
    description: 'Solicitudes',
  })
  async mine(@CurrentPrincipal() principal: Principal): Promise<PortalPrivacyRequestList> {
    return { data: await this.requests.mine(principal) };
  }

  @Post()
  @Throttle(FORM_THROTTLE)
  @ApiOperation({
    summary: 'Presentar una consulta o un reclamo sobre mis datos',
    description: 'El nombre y el correo los pone su cuenta.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PrivacyRequestReceiptResponse,
    description: 'Recibida',
  })
  async file(
    @CurrentPrincipal() principal: Principal,
    @Body() body: PortalPrivacyRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyRequestReceiptResponse> {
    return this.requests.filePortal(principal, body, meta);
  }
}
