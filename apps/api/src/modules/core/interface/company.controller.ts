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
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createSiteRequestSchema,
  siteListResponseSchema,
  siteSchema,
  tenantProfileSchema,
  updateSiteRequestSchema,
  updateTenantRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TenantAndSitesUseCase } from '../application/tenant-and-sites.js';
import { ApiCoreWriteErrors, ApiIfMatch, CoreCreatedResponse } from './core-openapi.js';

class TenantProfileResponse extends createZodDto(tenantProfileSchema) {}
class UpdateTenantRequest extends createZodDto(updateTenantRequestSchema) {}
class SiteListResponse extends createZodDto(siteListResponseSchema) {}
class SiteResponse extends createZodDto(siteSchema) {}
class CreateSiteRequest extends createZodDto(createSiteRequestSchema) {}
class UpdateSiteRequest extends createZodDto(updateSiteRequestSchema) {}

/** Datos legales de la empresa y sus sedes (M00, B12). */
@ApiTags('Empresa y organización')
@Controller('v1')
@ApiPermissionErrors()
export class CompanyController {
  constructor(@Inject(TenantAndSitesUseCase) private readonly company: TenantAndSitesUseCase) {}

  @RequirePermission('core.tenant.read')
  @Get('tenant')
  @ApiOperation({ summary: 'Datos legales de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: TenantProfileResponse, description: 'Empresa' })
  async tenant(@CurrentPrincipal() principal: Principal): Promise<TenantProfileResponse> {
    return this.company.tenant(principal);
  }

  @RequirePermission('core.tenant.update')
  @Patch('tenant')
  @ApiOperation({ summary: 'Cambiar la razón social, el nombre comercial o el NIT' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: TenantProfileResponse, description: 'Empresa' })
  @ApiCoreWriteErrors()
  async updateTenant(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTenantRequest,
    @Meta() meta: RequestMeta,
  ): Promise<TenantProfileResponse> {
    return this.company.updateTenant(principal, versionFromIfMatch(ifMatch), body, meta);
  }

  @RequirePermission('core.org.read')
  @Get('sites')
  @ApiOperation({ summary: 'Sedes de la empresa; la principal primero' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteListResponse, description: 'Sedes' })
  async sites(@CurrentPrincipal() principal: Principal): Promise<SiteListResponse> {
    return { data: await this.company.sites(principal) };
  }

  @RequirePermission('core.org.manage')
  @Post('sites')
  @ApiOperation({ summary: 'Crear una sede', description: 'La primera queda como principal.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creada' })
  @ApiCoreWriteErrors()
  async createSite(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateSiteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.company.createSite(principal, body, meta) };
  }

  @RequirePermission('core.org.manage')
  @Patch('sites/:id')
  @ApiOperation({ summary: 'Editar, inactivar o marcar como principal una sede' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: SiteResponse, description: 'Sede' })
  @ApiCoreWriteErrors()
  async updateSite(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSiteRequest,
    @Meta() meta: RequestMeta,
  ): Promise<SiteResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.company.updateSite(principal, target, body, meta);
  }

  @RequirePermission('core.org.manage')
  @Delete('sites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una sede que no es la principal' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Eliminada' })
  @ApiCoreWriteErrors()
  async deleteSite(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.company.deleteSite(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }
}
