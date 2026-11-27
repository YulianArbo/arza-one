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
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  changeTenantPlanSchema,
  createPlatformTenantSchema,
  errorResponseSchema,
  platformTenantListResponseSchema,
  requestTenantDeletionSchema,
  suspendTenantSchema,
  tenantCreatedResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PlatformTenantsUseCase } from '../application/platform-tenants.js';

class PlatformTenantListResponse extends createZodDto(platformTenantListResponseSchema) {}
class CreatePlatformTenantRequest extends createZodDto(createPlatformTenantSchema) {}
class TenantCreatedResponse extends createZodDto(tenantCreatedResponseSchema) {}
class ChangeTenantPlanRequest extends createZodDto(changeTenantPlanSchema) {}
class SuspendTenantRequest extends createZodDto(suspendTenantSchema) {}
class RequestTenantDeletionRequest extends createZodDto(requestTenantDeletionSchema) {}
class TenantDeletionResponse extends createZodDto(
  z.object({ deletion_due_on: z.iso.date().describe('Fecha en que se borrarán sus datos') }),
) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', description: 'Versión de la empresa', required: true };
const CONFLICT = {
  status: HttpStatus.CONFLICT,
  type: ErrorResponse.Output,
  description: 'Otra versión, estado que no lo permite o NIT o correo ya registrados',
};
const RULE = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: ErrorResponse.Output,
  description: 'Datos inválidos, empresa operadora protegida, NIT distinto o sin exportación',
};
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  type: ErrorResponse.Output,
  description: 'No existe',
};

/**
 * Empresas de la plataforma (M00, B48): solo el operador de la plataforma, desde la empresa que la
 * opera. Las acciones que cambian el acceso de una empresa exigen confirmar la identidad.
 */
@ApiTags('Empresas de la plataforma')
@Controller('v1/platform/tenants')
@ApiPermissionErrors()
export class PlatformTenantsController {
  constructor(@Inject(PlatformTenantsUseCase) private readonly tenants: PlatformTenantsUseCase) {}

  @RequirePermission('platform.tenant.read')
  @Get()
  @ApiOperation({ summary: 'Empresas con su plan, su uso y su estado; nunca su contenido' })
  @ZodResponse({ status: HttpStatus.OK, type: PlatformTenantListResponse, description: 'Empresas' })
  async list(@CurrentPrincipal() principal: Principal): Promise<PlatformTenantListResponse> {
    return { data: await this.tenants.list(principal) };
  }

  @RequirePermission('platform.tenant.manage')
  @RecentAuthentication()
  @Post()
  @ApiOperation({
    summary: 'Dar de alta una empresa e invitar a su primer administrador',
    description:
      'La empresa nace con sus catálogos, roles y plantillas; la invitación vence en 72 horas.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: TenantCreatedResponse, description: 'Creada' })
  @ApiResponse(CONFLICT)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreatePlatformTenantRequest,
    @Meta() meta: RequestMeta,
  ): Promise<TenantCreatedResponse> {
    return this.tenants.create(principal, body, meta);
  }

  @RequirePermission('platform.tenant.manage')
  @Put(':id/plan')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar el plan y sus límites' })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Plan cambiado' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  async changePlan(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ChangeTenantPlanRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.tenants.changePlan(principal, id, versionFromIfMatch(ifMatch), body, meta);
  }

  @RequirePermission('platform.tenant.manage')
  @RecentAuthentication()
  @Post(':id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Suspender la empresa: nadie entra y se cierran sus sesiones' })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Suspendida' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  @ApiResponse(RULE)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SuspendTenantRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.tenants.suspend(principal, id, versionFromIfMatch(ifMatch), body.reason, meta);
  }

  @RequirePermission('platform.tenant.manage')
  @RecentAuthentication()
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reactivar una empresa suspendida sin eliminación pendiente' })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Reactivada' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.tenants.reactivate(principal, id, versionFromIfMatch(ifMatch), meta);
  }

  @RequirePermission('platform.tenant.delete')
  @RecentAuthentication()
  @Post(':id/deletion')
  @ApiOperation({
    summary: 'Pedir la eliminación de una empresa suspendida',
    description:
      'Exige una exportación lista de los últimos 30 días y el NIT escrito. Sus datos se borran 30 días después.',
  })
  @ApiHeader(IF_MATCH)
  @ZodResponse({ status: HttpStatus.CREATED, type: TenantDeletionResponse, description: 'Pedida' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  @ApiResponse(RULE)
  async requestDeletion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RequestTenantDeletionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<TenantDeletionResponse> {
    const version = versionFromIfMatch(ifMatch);
    const dueOn = await this.tenants.requestDeletion(principal, id, version, body, meta);
    return { deletion_due_on: dueOn };
  }

  @RequirePermission('platform.tenant.delete')
  @Delete(':id/deletion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancelar la eliminación pedida; la empresa sigue suspendida' })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cancelada' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse(CONFLICT)
  async cancelDeletion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.tenants.cancelDeletion(principal, id, versionFromIfMatch(ifMatch), meta);
  }
}
