import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  consentListQuerySchema,
  consentListResponseSchema,
  consentSchema,
  revokeConsentRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ConsentsUseCase } from '../application/consents.js';
import { ApiPrivacyErrors } from './privacy-openapi.js';

class ConsentListQuery extends createZodDto(consentListQuerySchema) {}
class ConsentListResponse extends createZodDto(consentListResponseSchema) {}
class ConsentResponse extends createZodDto(consentSchema) {}
class RevokeConsentRequest extends createZodDto(revokeConsentRequestSchema) {}

/**
 * Registro de autorizaciones con su evidencia (M18, B17): Privacidad › Autorizaciones. Se toman
 * en los formularios de cada módulo; aquí se consultan y se revocan.
 */
@ApiTags('Privacidad')
@Controller('v1/consents')
@ApiPermissionErrors()
export class ConsentsController {
  constructor(@Inject(ConsentsUseCase) private readonly consents: ConsentsUseCase) {}

  @RequirePermission('privacy.consent.read')
  @Get()
  @ApiOperation({ summary: 'Autorizaciones, las más recientes primero, con filtros' })
  @ZodResponse({ status: HttpStatus.OK, type: ConsentListResponse, description: 'Autorizaciones' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: ConsentListQuery,
  ): Promise<ConsentListResponse> {
    return this.consents.list(principal, ability, query);
  }

  @RequirePermission('privacy.consent.read')
  @Get(':id')
  @ApiOperation({ summary: 'Una autorización con su evidencia' })
  @ZodResponse({ status: HttpStatus.OK, type: ConsentResponse, description: 'Autorización' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsentResponse> {
    return this.consents.get(principal, ability, id);
  }

  // Una revocatoria es una solicitud del titular: la tramita quien gestiona esas solicitudes.
  @RequirePermission('privacy.request.manage')
  @Post(':id/actions/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revocar la autorización',
    description: 'Una sola vez y con motivo. La autorización no se borra.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ConsentResponse, description: 'Revocada' })
  @ApiPrivacyErrors()
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RevokeConsentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ConsentResponse> {
    return this.consents.revoke(principal, id, body, meta);
  }
}
