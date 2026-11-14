import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  slaPolicyListResponseSchema,
  slaPolicyRequestSchema,
  warrantyListQuerySchema,
  warrantyListResponseSchema,
  warrantyRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { SlaPoliciesUseCase } from '../application/sla-policies.js';
import { WarrantiesUseCase } from '../application/warranties.js';
import { ApiServiceIfMatch, ApiServiceWriteErrors, UUID } from './service-openapi.js';

class SlaPolicyListResponse extends createZodDto(slaPolicyListResponseSchema) {}
class SlaPolicyRequest extends createZodDto(slaPolicyRequestSchema) {}
class WarrantyListQuery extends createZodDto(warrantyListQuerySchema) {}
class WarrantyListResponse extends createZodDto(warrantyListResponseSchema) {}
class WarrantyRequest extends createZodDto(warrantyRequestSchema) {}

/** Las garantías son del equipo de servicio: quien ve solo lo propio no las consulta. */
function assertSeesAll(ability: AppAbility): void {
  if (!hasUnconditionalPermission(ability, 'service.ticket.read')) throw permissionDenied();
}

/** Acuerdos de tiempo por prioridad y garantías por entregable (M08, B28). */
@ApiTags('Servicio')
@Controller('v1')
@ApiPermissionErrors()
export class ServiceSettingsController {
  constructor(
    @Inject(SlaPoliciesUseCase) private readonly policies: SlaPoliciesUseCase,
    @Inject(WarrantiesUseCase) private readonly warranties: WarrantiesUseCase,
  ) {}

  @RequirePermission('service.ticket.read')
  @Get('sla-policies')
  @ApiOperation({
    summary: 'Acuerdos de tiempo',
    description: 'Primera respuesta y solución por prioridad, y cómo cuenta el reloj.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SlaPolicyListResponse, description: 'Acuerdos' })
  async listPolicies(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<SlaPolicyListResponse> {
    return this.policies.list(principal, ability);
  }

  @RequirePermission('service.sla.manage')
  @Put('sla-policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar un acuerdo de tiempo',
    description: 'Vale para los tiquetes que se registren o cambien de prioridad desde ahora.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiServiceWriteErrors()
  async updatePolicy(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SlaPolicyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.policies.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('service.ticket.read')
  @Get('warranties')
  @ApiOperation({
    summary: 'Garantías por entregable',
    description: 'Nacen cuando el cliente acepta un entregable; las que vencen primero, arriba.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: WarrantyListResponse, description: 'Garantías' })
  async listWarranties(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: WarrantyListQuery,
  ): Promise<WarrantyListResponse> {
    assertSeesAll(ability);
    return this.warranties.list(principal, ability, query);
  }

  @RequirePermission('service.sla.manage')
  @Put('warranties/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ajustar una garantía', description: 'Su fin y su alcance.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiServiceWriteErrors()
  async updateWarranty(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: WarrantyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.warranties.update(principal, target, body, meta);
  }
}
