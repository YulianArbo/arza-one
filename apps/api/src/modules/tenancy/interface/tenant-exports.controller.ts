import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  errorResponseSchema,
  tenantExportCreatedResponseSchema,
  tenantExportListResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TenantExportsUseCase } from '../application/tenant-exports.js';

class TenantExportListResponse extends createZodDto(tenantExportListResponseSchema) {}
class TenantExportCreatedResponse extends createZodDto(tenantExportCreatedResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/**
 * Exportación completa de la empresa (M00, B48, decisiones 3 a 5): solo la Dirección, con su
 * identidad confirmada hace poco para pedirla y descargarla.
 */
@ApiTags('Empresa y organización')
@Controller('v1/tenant/exports')
@ApiPermissionErrors()
export class TenantExportsController {
  constructor(@Inject(TenantExportsUseCase) private readonly exports: TenantExportsUseCase) {}

  @RequirePermission('core.tenant.export')
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Exportaciones de la empresa, la más reciente primero' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: TenantExportListResponse,
    description: 'Exportaciones',
  })
  async list(@CurrentPrincipal() principal: Principal): Promise<TenantExportListResponse> {
    return { data: await this.exports.list(principal) };
  }

  @RequirePermission('core.tenant.export')
  @RecentAuthentication()
  @Post()
  @ApiOperation({
    summary: 'Pedir la exportación completa de la empresa',
    description: 'El sistema la genera en unos minutos; queda disponible 7 días.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: TenantExportCreatedResponse,
    description: 'En cola',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'Ya hay una exportación en curso',
  })
  async request(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<TenantExportCreatedResponse> {
    return { id: await this.exports.request(principal, meta) };
  }

  @RequirePermission('core.tenant.export')
  @RecentAuthentication()
  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Descargar la exportación (ZIP); queda en la auditoría' })
  @ApiProduces('application/zip')
  @ApiResponse({ status: HttpStatus.OK, description: 'El archivo ZIP' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'No existe',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'No está lista o ya venció',
  })
  async download(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.exports.download(principal, id, meta);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.content, { length: file.sizeBytes });
  }
}
