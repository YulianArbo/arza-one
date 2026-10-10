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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  businessDaysQuerySchema,
  businessDaysResponseSchema,
  createHolidayRequestSchema,
  createParameterVersionRequestSchema,
  createSequenceRequestSchema,
  holidayListQuerySchema,
  holidayListResponseSchema,
  parameterHistoryResponseSchema,
  parameterListResponseSchema,
  sequenceListResponseSchema,
  sequenceSchema,
  updateSequenceRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CalendarUseCase } from '../application/calendar.js';
import { ParametersUseCase } from '../application/parameters.js';
import { SequencesUseCase } from '../application/sequences.js';
import { ApiCoreWriteErrors, ApiIfMatch, CoreCreatedResponse } from './core-openapi.js';

class ParameterListResponse extends createZodDto(parameterListResponseSchema) {}
class ParameterHistoryResponse extends createZodDto(parameterHistoryResponseSchema) {}
class CreateParameterVersionRequest extends createZodDto(createParameterVersionRequestSchema) {}
class SequenceListResponse extends createZodDto(sequenceListResponseSchema) {}
class SequenceResponse extends createZodDto(sequenceSchema) {}
class CreateSequenceRequest extends createZodDto(createSequenceRequestSchema) {}
class UpdateSequenceRequest extends createZodDto(updateSequenceRequestSchema) {}
class HolidayListQuery extends createZodDto(holidayListQuerySchema) {}
class HolidayListResponse extends createZodDto(holidayListResponseSchema) {}
class CreateHolidayRequest extends createZodDto(createHolidayRequestSchema) {}
class BusinessDaysQuery extends createZodDto(businessDaysQuerySchema) {}
class BusinessDaysResponse extends createZodDto(businessDaysResponseSchema) {}

/** Parámetros con vigencia, consecutivos, festivos y días hábiles (M00, B12). */
@ApiTags('Parámetros, consecutivos y calendario')
@Controller('v1')
@ApiPermissionErrors()
export class SettingsController {
  constructor(
    @Inject(ParametersUseCase) private readonly parameters: ParametersUseCase,
    @Inject(SequencesUseCase) private readonly sequences: SequencesUseCase,
    @Inject(CalendarUseCase) private readonly calendar: CalendarUseCase,
  ) {}

  @RequirePermission('core.parameter.read')
  @Get('parameters')
  @ApiOperation({ summary: 'Parámetros con su vigencia de hoy y la programada' })
  @ZodResponse({ status: HttpStatus.OK, type: ParameterListResponse, description: 'Parámetros' })
  async listParameters(@CurrentPrincipal() principal: Principal): Promise<ParameterListResponse> {
    return { data: await this.parameters.list(principal) };
  }

  @RequirePermission('core.parameter.read')
  @Get('parameters/:key/history')
  @ApiOperation({ summary: 'Todas las vigencias de un parámetro' })
  @ZodResponse({ status: HttpStatus.OK, type: ParameterHistoryResponse, description: 'Historial' })
  @ApiCoreWriteErrors()
  async parameterHistory(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
  ): Promise<ParameterHistoryResponse> {
    return this.parameters.history(principal, key);
  }

  @RequirePermission('core.parameter.manage')
  @Post('parameters/:key/versions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Crear una vigencia nueva de un parámetro',
    description: 'Empieza hoy o más adelante; la anterior se conserva y termina el día antes.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Vigencia creada' })
  @ApiCoreWriteErrors()
  async createParameterVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
    @Body() body: CreateParameterVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.parameters.createVersion(principal, key, body, meta);
  }

  @RequirePermission('core.sequence.manage')
  @Get('sequences')
  @ApiOperation({ summary: 'Tipos de consecutivo con el siguiente código de cada uno' })
  @ZodResponse({ status: HttpStatus.OK, type: SequenceListResponse, description: 'Consecutivos' })
  async listSequences(@CurrentPrincipal() principal: Principal): Promise<SequenceListResponse> {
    return { data: await this.sequences.list(principal) };
  }

  @RequirePermission('core.sequence.manage')
  @Post('sequences')
  @ApiOperation({ summary: 'Crear un tipo de consecutivo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async createSequence(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateSequenceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.sequences.create(principal, body, meta) };
  }

  @RequirePermission('core.sequence.manage')
  @Patch('sequences/:id')
  @ApiOperation({ summary: 'Cambiar el nombre, el prefijo o los dígitos; el número no se edita' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: SequenceResponse, description: 'Consecutivo' })
  @ApiCoreWriteErrors()
  async updateSequence(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSequenceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<SequenceResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.sequences.update(principal, target, body, meta);
  }

  @RequirePermission('core.parameter.read')
  @Get('holidays')
  @ApiOperation({ summary: 'Festivos de un año' })
  @ZodResponse({ status: HttpStatus.OK, type: HolidayListResponse, description: 'Festivos' })
  async listHolidays(
    @CurrentPrincipal() principal: Principal,
    @Query() query: HolidayListQuery,
  ): Promise<HolidayListResponse> {
    return { data: await this.calendar.holidays(principal, query.year) };
  }

  @RequirePermission('core.parameter.manage')
  @Post('holidays')
  @ApiOperation({ summary: 'Agregar un festivo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async addHoliday(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateHolidayRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.calendar.addHoliday(principal, body, meta) };
  }

  @RequirePermission('core.parameter.manage')
  @Delete('holidays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un festivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Quitado' })
  @ApiCoreWriteErrors()
  async removeHoliday(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.calendar.removeHoliday(principal, id, meta);
  }

  @RequirePermission('core.parameter.read')
  @Get('business-days')
  @ApiOperation({ summary: 'Fecha en que vence un plazo en días hábiles' })
  @ZodResponse({ status: HttpStatus.OK, type: BusinessDaysResponse, description: 'Vencimiento' })
  async businessDays(
    @CurrentPrincipal() principal: Principal,
    @Query() query: BusinessDaysQuery,
  ): Promise<BusinessDaysResponse> {
    const date = await this.calendar.businessDays(principal, query.from, query.days);
    return { from: query.from, days: query.days, date };
  }
}
