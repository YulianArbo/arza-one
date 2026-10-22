import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  campaignListResponseSchema,
  campaignRequestSchema,
  funnelQuerySchema,
  funnelReportSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CampaignsUseCase } from '../application/campaigns.js';
import { FunnelReportUseCase } from '../application/funnel-report.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class CampaignListResponse extends createZodDto(campaignListResponseSchema) {}
class CampaignRequest extends createZodDto(campaignRequestSchema) {}
class FunnelQuery extends createZodDto(funnelQuerySchema) {}
class FunnelReportResponse extends createZodDto(funnelReportSchema) {}

/** Campañas: las ve quien ve prospectos y las administra quien los edita (B22). */
@ApiTags('Comercial')
@Controller('v1/crm/campaigns')
@ApiPermissionErrors()
export class CampaignsController {
  constructor(@Inject(CampaignsUseCase) private readonly campaigns: CampaignsUseCase) {}

  @RequirePermission('crm.lead.read')
  @Get()
  @ApiOperation({ summary: 'Campañas, con cuántos prospectos trajo cada una' })
  @ZodResponse({ status: HttpStatus.OK, type: CampaignListResponse, description: 'Campañas' })
  async list(@CurrentPrincipal() principal: Principal): Promise<CampaignListResponse> {
    return this.campaigns.list(principal);
  }

  @RequirePermission('crm.lead.update')
  @Post()
  @ApiOperation({ summary: 'Crear una campaña' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Creada' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CampaignRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.campaigns.create(principal, body, meta) };
  }

  @RequirePermission('crm.lead.update')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar una campaña' })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CampaignRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.campaigns.update(
      principal,
      { id, version: versionFromIfMatch(ifMatch) },
      body,
      meta,
    );
  }
}

/** Informe del embudo, RE-COM-001 Registro de Oportunidades (B22). */
@ApiTags('Comercial')
@Controller('v1/crm/reports/funnel')
@ApiPermissionErrors()
export class FunnelReportController {
  constructor(@Inject(FunnelReportUseCase) private readonly reports: FunnelReportUseCase) {}

  @RequirePermission('crm.report.read')
  @Get()
  @ApiOperation({
    summary: 'Informe del embudo (RE-COM-001)',
    description:
      'Etapas, totales, motivos de pérdida y el registro de las oportunidades del periodo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FunnelReportResponse, description: 'Informe' })
  async report(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FunnelQuery,
  ): Promise<FunnelReportResponse> {
    return this.reports.report(principal, query);
  }

  @RequirePermission('crm.report.read')
  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar el RE-COM-001 a CSV',
    description:
      'Con los mismos filtros; separado por punto y coma para Excel. Queda en la auditoría.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Body() query: FunnelQuery,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.reports.export(principal, query, meta);
    response.attachment(file.fileName);
    return file.content;
  }
}
