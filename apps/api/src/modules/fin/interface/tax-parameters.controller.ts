import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createTaxParameterVersionRequestSchema,
  errorResponseSchema,
  taxParameterHistoryResponseSchema,
  taxParameterListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TaxParametersUseCase } from '../application/tax-parameters.js';

class TaxParameterListResponse extends createZodDto(taxParameterListResponseSchema) {}
class TaxParameterHistoryResponse extends createZodDto(taxParameterHistoryResponseSchema) {}
class CreateTaxParameterVersionRequest extends createZodDto(
  createTaxParameterVersionRequestSchema,
) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class FinErrorResponse extends createZodDto(errorResponseSchema) {}

/** Parámetros tributarios vigentes (M10, adelantados en B23; numeral 12.4). */
@ApiTags('Finanzas')
@Controller('v1/finance/tax-parameters')
@ApiPermissionErrors()
export class TaxParametersController {
  constructor(@Inject(TaxParametersUseCase) private readonly taxes: TaxParametersUseCase) {}

  @RequirePermission('finance.tax_parameter.manage')
  @Get()
  @ApiOperation({ summary: 'Impuestos con su tarifa de hoy y la programada' })
  @ZodResponse({ status: HttpStatus.OK, type: TaxParameterListResponse, description: 'Impuestos' })
  async list(@CurrentPrincipal() principal: Principal): Promise<TaxParameterListResponse> {
    return { data: await this.taxes.list(principal) };
  }

  @RequirePermission('finance.tax_parameter.manage')
  @Get(':key/history')
  @ApiOperation({ summary: 'Todas las vigencias de un impuesto' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: TaxParameterHistoryResponse,
    description: 'Historial',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: FinErrorResponse.Output,
    description: 'No existe',
  })
  async history(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
  ): Promise<TaxParameterHistoryResponse> {
    return this.taxes.history(principal, key);
  }

  @RequirePermission('finance.tax_parameter.manage')
  @Post('versions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar una tarifa nueva',
    description:
      'Empieza hoy o más adelante; la anterior se conserva y termina el día antes. Una clave nueva exige su nombre.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Vigencia creada' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: FinErrorResponse.Output,
    description: 'Datos inválidos o una fecha que reescribe el pasado',
  })
  async createVersion(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateTaxParameterVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.taxes.createVersion(principal, body, meta);
  }
}
