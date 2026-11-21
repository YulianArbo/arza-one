import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assessStandardSchema,
  standardsAssessmentSchema,
  standardsScoreSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { sstInvalid } from '../application/sst-support.js';
import { Standards } from '../application/standards.js';

class SstAssessmentResponse extends createZodDto(standardsAssessmentSchema) {}
class SstScoreResponse extends createZodDto(standardsScoreSchema) {}
class SstAssessBody extends createZodDto(assessStandardSchema) {}
const YEAR = new ParseIntPipe();

function checkedYear(year: number): number {
  if (year < 2020 || year > 2100) throw sstInvalid('El año de la autoevaluación no es válido.');
  return year;
}

// Autoevaluación de estándares mínimos (B37, decisión 4; Resolución 0312 de 2019).

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst/standards-assessments/:year')
@ApiPermissionErrors()
export class StandardsController {
  constructor(@Inject(Standards) private readonly standards: Standards) {}

  @Get()
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar la autoevaluación del año con su puntaje' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: SstAssessmentResponse,
    description: 'Autoevaluación',
  })
  async assessment(
    @CurrentPrincipal() principal: Principal,
    @Param('year', YEAR) year: number,
  ): Promise<SstAssessmentResponse> {
    return this.standards.assessment(principal, checkedYear(year));
  }

  @Get('score')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Calcular el puntaje y su clasificación (Resolución 0312)' })
  @ZodResponse({ status: HttpStatus.OK, type: SstScoreResponse, description: 'Puntaje' })
  async score(
    @CurrentPrincipal() principal: Principal,
    @Param('year', YEAR) year: number,
  ): Promise<SstScoreResponse> {
    return (await this.standards.assessment(principal, checkedYear(year))).score;
  }

  @Put('standards/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.standards.manage')
  @ApiHeader({
    name: 'If-Match',
    required: false,
    description: 'Versión de la evaluación del estándar; sin cabecera, solo si aún no se evalúa',
  })
  @ApiOperation({ summary: 'Evaluar un estándar del año' })
  async assess(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('year', YEAR) year: number,
    @Param('code') code: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstAssessBody,
  ): Promise<void> {
    const target = {
      year: checkedYear(year),
      code,
      version: version === undefined ? 0 : versionFromIfMatch(version),
    };
    await this.standards.assess(principal, meta, target, input);
  }
}
