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
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  analyzeMeasurementSchema,
  calculateIndicatorSchema,
  indicatorListResponseSchema,
  indicatorSeriesResponseSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  recordMeasurementSchema,
  saveIndicatorSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Indicators } from '../application/indicators.js';
import { Measurements } from '../application/measurements.js';

class QmsIndicatorListResponse extends createZodDto(indicatorListResponseSchema) {}
class QmsIndicatorSeriesResponse extends createZodDto(indicatorSeriesResponseSchema) {}
class QmsIndicatorBody extends createZodDto(saveIndicatorSchema) {}
class QmsMeasurementBody extends createZodDto(recordMeasurementSchema) {}
class QmsAnalyzeMeasurementBody extends createZodDto(analyzeMeasurementSchema) {}
class QmsCalculateIndicatorBody extends createZodDto(calculateIndicatorSchema) {}
class QmsIndicatorCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
class QmsMeasurementCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Indicadores con ficha, medición, análisis y tendencia, y su matriz RE-SGC-006 (B39).

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class IndicatorsController {
  constructor(
    @Inject(Indicators) private readonly indicators: Indicators,
    @Inject(Measurements) private readonly measurements: Measurements,
  ) {}

  @Get('indicators')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar la matriz de indicadores por proceso (RE-SGC-006)' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsIndicatorListResponse, description: 'Matriz' })
  async list(@CurrentPrincipal() principal: Principal): Promise<QmsIndicatorListResponse> {
    return { data: await this.indicators.list(principal) };
  }

  @Post('indicators/export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Descargar la matriz de indicadores (CSV)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.indicators.export(principal, meta);
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }

  @Post('indicators')
  @RequirePermission('qms.indicator.manage')
  @ApiOperation({ summary: 'Crear la ficha de un indicador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsIndicatorCodeResponse, description: 'Hecho' })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsIndicatorBody,
  ): Promise<QmsIndicatorCodeResponse> {
    return this.indicators.create(principal, meta, input);
  }

  @Patch('indicators/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.indicator.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar la ficha de un indicador' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsIndicatorBody,
  ): Promise<void> {
    await this.indicators.update(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      input,
    );
  }

  @Get('indicators/:id/series')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Ver la ficha y la serie de mediciones de un indicador' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsIndicatorSeriesResponse, description: 'Serie' })
  async series(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<QmsIndicatorSeriesResponse> {
    return this.indicators.series({ principal, ability }, id);
  }

  @Post('indicators/:id/actions/calculate')
  @RequirePermission('qms.indicator.manage')
  @ApiOperation({ summary: 'Calcular ahora un indicador automático (último periodo cerrado)' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: QmsMeasurementCreatedResponse,
    description: 'Medición',
  })
  async calculate(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: QmsCalculateIndicatorBody,
  ): Promise<QmsMeasurementCreatedResponse> {
    return { id: await this.measurements.calculate({ principal, ability }, meta, id, input) };
  }

  @Get('my/indicators')
  @RequirePermission('qms.indicator.measure')
  @ApiOperation({ summary: 'Los indicadores a mi cargo' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsIndicatorListResponse, description: 'Lista' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<QmsIndicatorListResponse> {
    return { data: await this.indicators.mine(principal) };
  }

  @Get('my/indicators/:id/series')
  @RequirePermission('qms.indicator.measure')
  @ApiOperation({ summary: 'La serie de mediciones de un indicador a mi cargo' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsIndicatorSeriesResponse, description: 'Serie' })
  async mySeries(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<QmsIndicatorSeriesResponse> {
    return this.indicators.series({ principal, ability }, id);
  }

  @Post('indicators/:id/measurements')
  @RequirePermission('qms.indicator.measure')
  @ApiOperation({ summary: 'Registrar la medición de un periodo con su evidencia' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: QmsMeasurementCreatedResponse,
    description: 'Registrada',
  })
  async record(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: QmsMeasurementBody,
  ): Promise<QmsMeasurementCreatedResponse> {
    return { id: await this.measurements.record({ principal, ability }, meta, id, input) };
  }

  @Patch('measurements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.indicator.measure')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Escribir el análisis de una medición' })
  async analyze(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsAnalyzeMeasurementBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.measurements.analyze({ principal, ability }, meta, target, input);
  }
}
