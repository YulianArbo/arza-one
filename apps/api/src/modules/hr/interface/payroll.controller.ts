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
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  closePayrollPeriodSchema,
  hrCreatedResponseSchema,
  noveltyConceptListResponseSchema,
  payrollPeriodDetailResponseSchema,
  payrollPeriodListResponseSchema,
  payrollMonthSchema,
  registerNoveltySchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PayrollNovelties } from '../application/payroll-novelties.js';
import { PayrollPeriods } from '../application/payroll-periods.js';
import { hrInvalid } from '../application/hr-support.js';

class ConceptListResponse extends createZodDto(noveltyConceptListResponseSchema) {}
class PeriodListResponse extends createZodDto(payrollPeriodListResponseSchema) {}
class PeriodDetailResponse extends createZodDto(payrollPeriodDetailResponseSchema) {}
class RegisterNoveltyBody extends createZodDto(registerNoveltySchema) {}
class ClosePeriodBody extends createZodDto(closePayrollPeriodSchema) {}
class NoveltyCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });

/** El mes de la ruta, AAAA-MM. */
function periodFrom(value: string): string {
  const parsed = payrollMonthSchema.safeParse(value);
  if (!parsed.success) throw hrInvalid('Escriba el mes como AAAA-MM.');
  return parsed.data;
}

// Novedades de nómina por mes (B36, ficha 17.13, decisión 6). Talento humano registra las manuales;
// el cierre y el archivo para el software de nómina los hacen Talento humano o la Dirección.

@ApiTags('Talento Humano')
@Controller('v1/hr/payroll-novelties')
@ApiPermissionErrors()
export class PayrollController {
  constructor(
    @Inject(PayrollNovelties) private readonly novelties: PayrollNovelties,
    @Inject(PayrollPeriods) private readonly periods: PayrollPeriods,
  ) {}

  @Get('concepts')
  @RequirePermission('hr.payroll_novelty.manage')
  @ApiOperation({ summary: 'Consultar los conceptos de novedades de nómina' })
  @ZodResponse({ status: HttpStatus.OK, type: ConceptListResponse, description: 'Conceptos' })
  async concepts(@CurrentPrincipal() principal: Principal): Promise<ConceptListResponse> {
    return { data: await this.novelties.concepts(principal) };
  }

  @Get('periods')
  @RequirePermission('hr.payroll_novelty.close')
  @ApiOperation({ summary: 'Consultar los meses de novedades' })
  @ZodResponse({ status: HttpStatus.OK, type: PeriodListResponse, description: 'Meses' })
  async list(@CurrentPrincipal() principal: Principal): Promise<PeriodListResponse> {
    return { data: await this.periods.list(principal) };
  }

  @Get('periods/:period')
  @RequirePermission('hr.payroll_novelty.close')
  @ApiOperation({ summary: 'Consultar las novedades de un mes' })
  @ZodResponse({ status: HttpStatus.OK, type: PeriodDetailResponse, description: 'Novedades' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('period') period: string,
  ): Promise<PeriodDetailResponse> {
    return this.periods.detail(principal, periodFrom(period));
  }

  @Post()
  @RequirePermission('hr.payroll_novelty.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una novedad de nómina manual' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: NoveltyCreatedResponse,
    description: 'Registrada',
  })
  async register(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RegisterNoveltyBody,
  ): Promise<NoveltyCreatedResponse> {
    return { id: await this.novelties.register(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/actions/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.payroll_novelty.manage')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la novedad' })
  @ApiOperation({ summary: 'Retirar una novedad manual del mes abierto' })
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.novelties.remove(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post('close-period')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.payroll_novelty.close')
  @ApiOperation({ summary: 'Cerrar el mes de novedades; después no admite cambios' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: ClosePeriodBody,
  ): Promise<void> {
    await this.periods.close(principal, meta, input.period);
  }

  @Post('periods/:period/export')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('hr.payroll_novelty.close')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Descargar el archivo de novedades de un mes cerrado (CSV)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('period') period: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.periods.export(principal, meta, periodFrom(period));
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }
}
