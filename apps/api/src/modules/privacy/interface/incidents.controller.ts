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
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addIncidentMeasureSchema,
  closePrivacyIncidentSchema,
  cookieConsentListResponseSchema,
  cookieConsentQuerySchema,
  cookieReportSchema,
  createPrivacyIncidentSchema,
  notifyHoldersSchema,
  privacyIncidentListQuerySchema,
  privacyIncidentListResponseSchema,
  privacyIncidentNoteSchema,
  privacyIncidentSchema,
  reportPrivacyIncidentSchema,
  updatePrivacyIncidentSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { IncidentsUseCase } from '../application/incidents.js';
import { PrivacyReportsUseCase } from '../application/privacy-reports.js';
import { ApiIfMatch, ApiPrivacyErrors, PrivacyCreatedResponse } from './privacy-openapi.js';

class PrivacyIncidentListQuery extends createZodDto(privacyIncidentListQuerySchema) {}
class PrivacyIncidentListResponse extends createZodDto(privacyIncidentListResponseSchema) {}
class PrivacyIncidentResponse extends createZodDto(privacyIncidentSchema) {}
class PrivacyCreateIncidentBody extends createZodDto(createPrivacyIncidentSchema) {}
class PrivacyUpdateIncidentBody extends createZodDto(updatePrivacyIncidentSchema) {}
class PrivacyIncidentNoteBody extends createZodDto(privacyIncidentNoteSchema) {}
class PrivacyReportIncidentBody extends createZodDto(reportPrivacyIncidentSchema) {}
class PrivacyNotifyHoldersBody extends createZodDto(notifyHoldersSchema) {}
class PrivacyAddMeasureBody extends createZodDto(addIncidentMeasureSchema) {}
class PrivacyCloseIncidentBody extends createZodDto(closePrivacyIncidentSchema) {}
class CookieConsentQuery extends createZodDto(cookieConsentQuerySchema) {}
class CookieConsentListResponse extends createZodDto(cookieConsentListResponseSchema) {}
class CookieReportResponse extends createZodDto(cookieReportSchema) {}

const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

interface Target {
  readonly id: string;
  readonly version: number;
}

/**
 * Incidentes de seguridad con datos personales (M18, B42; numeral 15.7): Privacidad › Incidentes.
 * Cada paso va con la versión que se vio en If-Match.
 */
@ApiTags('Privacidad')
@Controller('v1/privacy-incidents')
@RequirePermission('privacy.incident.manage')
@ApiPermissionErrors()
export class PrivacyIncidentsController {
  constructor(
    @Inject(IncidentsUseCase) private readonly incidents: IncidentsUseCase,
    @Inject(PrivacyReportsUseCase) private readonly reports: PrivacyReportsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Incidentes, del más reciente al más viejo' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PrivacyIncidentListResponse,
    description: 'Incidentes',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: PrivacyIncidentListQuery,
  ): Promise<PrivacyIncidentListResponse> {
    return this.incidents.list(principal, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un incidente',
    description: 'Calcula la fecha límite de 15 días hábiles para reportarlo a la SIC.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PrivacyCreatedResponse,
    description: 'Registrado',
  })
  @ApiPrivacyErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: PrivacyCreateIncidentBody,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.incidents.create(principal, body, meta) };
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Descargar el registro de incidentes y reportes en CSV',
    description: 'Separado por punto y coma para Excel. Queda en la auditoría.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async exportRegister(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.reports.incidentsCsv(principal, meta);
    response.attachment(file.fileName);
    return file.content;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un incidente con su bitácora de medidas' })
  @ZodResponse({ status: HttpStatus.OK, type: PrivacyIncidentResponse, description: 'Incidente' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PrivacyIncidentResponse> {
    return this.incidents.get(principal, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Corregir el incidente', description: 'Mientras no se haya reportado.' })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyUpdateIncidentBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.update(principal, target(id, ifMatch), body, meta);
  }

  @Post(':id/actions/contain')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar que el incidente se contuvo' })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async contain(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyIncidentNoteBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.contain(principal, target(id, ifMatch), body, meta);
  }

  @Post(':id/actions/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar el reporte a la SIC',
    description: 'Con el día y el radicado.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async report(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyReportIncidentBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.report(principal, target(id, ifMatch), body, meta);
  }

  @Post(':id/actions/notify-holders')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar que se informó a los titulares afectados' })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async notifyHolders(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyNotifyHoldersBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.notifyHolders(principal, target(id, ifMatch), body, meta);
  }

  @Post(':id/measures')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Agregar una medida a la bitácora' })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async addMeasure(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyAddMeasureBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.addMeasure(principal, target(id, ifMatch), body, meta);
  }

  @Post(':id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar el incidente',
    description: 'Con el reporte a la SIC hecho o con el motivo para no reportarlo.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyCloseIncidentBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.incidents.close(principal, target(id, ifMatch), body, meta);
  }
}

function target(id: string, ifMatch: string | undefined): Target {
  return { id, version: versionFromIfMatch(ifMatch) };
}

/** Elecciones de cookies del sitio y su resumen (B42; B41, decisión 4): Privacidad › Cookies. */
@ApiTags('Privacidad')
@Controller('v1/privacy/cookie-consents')
@RequirePermission('privacy.notice.manage')
@ApiPermissionErrors()
export class CookieConsentsController {
  constructor(@Inject(PrivacyReportsUseCase) private readonly reports: PrivacyReportsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Elecciones de cookies del periodo, de la más nueva a la más vieja' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: CookieConsentListResponse,
    description: 'Elecciones',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: CookieConsentQuery,
  ): Promise<CookieConsentListResponse> {
    return this.reports.cookieConsents(principal, query);
  }

  @Get('report')
  @ApiOperation({ summary: 'Resumen del periodo: por categoría y por versión de la política' })
  @ZodResponse({ status: HttpStatus.OK, type: CookieReportResponse, description: 'Resumen' })
  async report(
    @CurrentPrincipal() principal: Principal,
    @Query() query: CookieConsentQuery,
  ): Promise<CookieReportResponse> {
    return this.reports.cookieReport(principal, query);
  }
}
