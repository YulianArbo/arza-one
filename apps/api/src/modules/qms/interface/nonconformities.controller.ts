import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  analyzeNonconformitySchema,
  closeNonconformitySchema,
  containNonconformitySchema,
  nonconformityDetailResponseSchema,
  nonconformityListResponseSchema,
  nonconformityQuerySchema,
  qmsCodeResponseSchema,
  reopenNonconformitySchema,
  reportNonconformitySchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Nonconformities } from '../application/nonconformities.js';
import { NonconformitySteps } from '../application/nonconformity-steps.js';

class QmsNonconformityListResponse extends createZodDto(nonconformityListResponseSchema) {}
class QmsNonconformityQuery extends createZodDto(nonconformityQuerySchema) {}
class QmsNonconformityDetailResponse extends createZodDto(nonconformityDetailResponseSchema) {}
class QmsReportBody extends createZodDto(reportNonconformitySchema) {}
class QmsContainBody extends createZodDto(containNonconformitySchema) {}
class QmsAnalyzeBody extends createZodDto(analyzeNonconformitySchema) {}
class QmsCloseBody extends createZodDto(closeNonconformitySchema) {}
class QmsReopenBody extends createZodDto(reopenNonconformitySchema) {}
class QmsCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// No conformidades y salidas no conformes y su flujo (B38, ficha 17.15).

@ApiTags('Calidad')
@Controller('v1/qms/nonconformities')
@ApiPermissionErrors()
export class NonconformitiesController {
  constructor(
    @Inject(Nonconformities) private readonly nonconformities: Nonconformities,
    @Inject(NonconformitySteps) private readonly steps: NonconformitySteps,
  ) {}

  @Get()
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar las no conformidades, por estado' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsNonconformityListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: QmsNonconformityQuery,
  ): Promise<QmsNonconformityListResponse> {
    return { data: await this.nonconformities.list(principal, query.status) };
  }

  @Post()
  @RequirePermission('qms.nonconformity.create')
  @ApiOperation({
    summary: 'Reportar una no conformidad; Calidad puede enlazarla a un incidente de SST',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCodeResponse, description: 'Reportada' })
  async report(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: QmsReportBody,
  ): Promise<QmsCodeResponse> {
    return this.nonconformities.report({ principal, ability }, meta, input);
  }

  @Get(':id')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Una no conformidad con su análisis y sus acciones' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: QmsNonconformityDetailResponse,
    description: 'Detalle',
  })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<QmsNonconformityDetailResponse> {
    return this.nonconformities.detail(principal, id);
  }

  @Post(':id/actions/contain')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.nonconformity.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar la corrección inmediata, la clasificación y el proceso' })
  async contain(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsContainBody,
  ): Promise<void> {
    await this.steps.contain(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/analyze')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.nonconformity.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar el análisis de causa (5 porqués o 6M) y la causa raíz' })
  async analyze(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsAnalyzeBody,
  ): Promise<void> {
    await this.steps.analyze(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/plan')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.nonconformity.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Dar el plan por registrado: exige al menos una acción vigente' })
  async plan(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.steps.plan(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post(':id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.nonconformity.close')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cerrar como eficaz una no conformidad verificada' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsCloseBody,
  ): Promise<void> {
    await this.steps.close(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/reopen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.nonconformity.close')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Reabrir una no conformidad verificada que no resultó eficaz' })
  async reopen(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsReopenBody,
  ): Promise<void> {
    await this.steps.reopen(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }
}
