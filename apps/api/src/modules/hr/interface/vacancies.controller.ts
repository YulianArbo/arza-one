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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  closeVacancySchema,
  hrCreatedResponseSchema,
  hrPositionListResponseSchema,
  saveVacancySchema,
  vacancyListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { VacanciesUseCase } from '../application/vacancies.js';

class VacancyListResponse extends createZodDto(vacancyListResponseSchema) {}
class VacancyCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
class SaveVacancyBody extends createZodDto(saveVacancySchema) {}
class CloseVacancyBody extends createZodDto(closeVacancySchema) {}
class VacancyPositionsResponse extends createZodDto(hrPositionListResponseSchema) {}

@ApiTags('Talento Humano')
@Controller('v1/hr/vacancies')
@ApiPermissionErrors()
export class VacanciesController {
  constructor(@Inject(VacanciesUseCase) private readonly vacancies: VacanciesUseCase) {}

  @Get('positions')
  @RequirePermission('hr.vacancy.manage')
  @ApiOperation({ summary: 'Consultar los cargos disponibles para vacantes' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: VacancyPositionsResponse,
    description: 'Cargos activos',
  })
  async positions(@CurrentPrincipal() principal: Principal): Promise<VacancyPositionsResponse> {
    return { data: await this.vacancies.positions(principal) };
  }

  @Get()
  @RequirePermission('hr.vacancy.manage')
  @ApiOperation({ summary: 'Consultar las vacantes de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: VacancyListResponse, description: 'Vacantes' })
  async list(@CurrentPrincipal() principal: Principal): Promise<VacancyListResponse> {
    return { data: await this.vacancies.list(principal) };
  }

  @Post()
  @RequirePermission('hr.vacancy.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una vacante' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: VacancyCreatedResponse,
    description: 'Vacante registrada',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SaveVacancyBody,
  ): Promise<VacancyCreatedResponse> {
    return { id: await this.vacancies.create(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.vacancy.manage')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la vacante' })
  @ApiOperation({ summary: 'Cerrar o cancelar una vacante' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CloseVacancyBody,
  ): Promise<void> {
    await this.vacancies.close(principal, meta, id, versionFromIfMatch(version), input);
  }
}
