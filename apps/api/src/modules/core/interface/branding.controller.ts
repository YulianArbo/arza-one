import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  errorResponseSchema,
  imageUploadRequestSchema,
  setImageRequestSchema,
  tenantBrandingSchema,
  updateTenantBrandingSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { OwnAccount, RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { imageResponse } from '../../../platform/http/image-response.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TenantBrandingUseCase } from '../application/tenant-branding.js';
import { ApiCoreWriteErrors, ApiIfMatch } from './core-openapi.js';

class TenantBrandingResponse extends createZodDto(tenantBrandingSchema) {}
class UpdateTenantBrandingRequest extends createZodDto(updateTenantBrandingSchema) {}
class ImageUploadRequest extends createZodDto(imageUploadRequestSchema) {}
class SetImageRequest extends createZodDto(setImageRequestSchema) {}
class UploadLinkResponse extends createZodDto(uploadLinkResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const NO_LOGO = {
  status: HttpStatus.NOT_FOUND,
  type: ErrorResponse.Output,
  description: 'La empresa no tiene logo',
};

/** Marca propia de la empresa (M00, B48): la ven todas sus personas y la cambia su administración. */
@ApiTags('Empresa y organización')
@Controller('v1')
@ApiPermissionErrors()
export class BrandingController {
  constructor(@Inject(TenantBrandingUseCase) private readonly brands: TenantBrandingUseCase) {}

  @OwnAccount()
  @Get('me/branding')
  @ApiOperation({ summary: 'Marca de la empresa de la persona: nombre, color y si tiene logo' })
  @ZodResponse({ status: HttpStatus.OK, type: TenantBrandingResponse, description: 'Marca' })
  async branding(@CurrentPrincipal() principal: Principal): Promise<TenantBrandingResponse> {
    return this.brands.branding(principal);
  }

  @OwnAccount()
  @Get('me/branding/logo')
  @ApiOperation({ summary: 'Logo de la empresa de la persona' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse(NO_LOGO)
  async logo(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.brands.logo(principal));
  }

  @RequirePermission('core.tenant.update')
  @Put('tenant/branding')
  @ApiOperation({ summary: 'Cambiar el nombre para mostrar y el color principal' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: TenantBrandingResponse, description: 'Marca' })
  @ApiCoreWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTenantBrandingRequest,
    @Meta() meta: RequestMeta,
  ): Promise<TenantBrandingResponse> {
    return this.brands.update(principal, versionFromIfMatch(ifMatch), body, meta);
  }

  @RequirePermission('core.tenant.update')
  @Post('tenant/branding/logo/uploads')
  @ApiOperation({ summary: 'Pedir el enlace para subir el logo', description: 'PNG o JPG.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: UploadLinkResponse, description: 'Enlace' })
  async requestLogoUpload(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ImageUploadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.brands.requestLogoUpload(principal, body, meta);
  }

  @RequirePermission('core.tenant.update')
  @Put('tenant/branding/logo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usar una imagen ya revisada como logo de la empresa' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Logo cambiado' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'La imagen no es propia, PNG o JPG revisada',
  })
  async setLogo(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SetImageRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.brands.setLogo(principal, body.file_id, meta);
  }

  @RequirePermission('core.tenant.update')
  @Delete('tenant/branding/logo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar el logo de la empresa' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Logo quitado' })
  async removeLogo(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.brands.removeLogo(principal, meta);
  }
}
