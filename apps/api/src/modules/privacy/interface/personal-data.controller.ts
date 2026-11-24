import {
  Body,
  Controller,
  Get,
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
  erasureResultSchema,
  personalDataReportSchema,
  personalDataRequestRefSchema,
  type ErasureResult,
  type PersonalDataReport,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PersonalDataUseCase } from '../application/personal-data.js';
import { ApiPrivacyErrors, PrivacyCreatedResponse } from './privacy-openapi.js';

class PersonalDataRequestBody extends createZodDto(personalDataRequestRefSchema) {}
class ErasureResultResponse extends createZodDto(erasureResultSchema) {}
class PersonalDataReportResponse extends createZodDto(personalDataReportSchema) {}

/**
 * Entrega y supresión de los datos de un titular (M18, B42; ficha 17.19; numeral 14: rutas
 * parties/{id}/personal-data/export · erase). Siempre desde una solicitud en trámite verificada.
 */
@ApiTags('Privacidad')
@Controller('v1')
@ApiPermissionErrors()
export class PersonalDataController {
  constructor(@Inject(PersonalDataUseCase) private readonly data: PersonalDataUseCase) {}

  @Post('parties/:id/personal-data/export')
  @RequirePermission('privacy.data.export')
  @ApiOperation({
    summary: 'Preparar la entrega de los datos del titular',
    description: 'Reúne lo de todos los módulos; el PDF queda listo en unos segundos.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PrivacyCreatedResponse,
    description: 'En preparación',
  })
  @ApiPrivacyErrors()
  async export(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) partyId: string,
    @Body() body: PersonalDataRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.data.export(principal, partyId, body.request_id, meta) };
  }

  @Post('parties/:id/personal-data/erase')
  @RequirePermission('privacy.data.erase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suprimir los datos del titular',
    description:
      'Vuelve anónimo lo que se puede; lo que la ley obliga a conservar queda bloqueado con su motivo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ErasureResultResponse, description: 'Resultado' })
  @ApiPrivacyErrors()
  async erase(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) partyId: string,
    @Body() body: PersonalDataRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<ErasureResult> {
    return this.data.erase(principal, partyId, body.request_id, meta);
  }

  @Get('privacy-requests/:id/exports/:exportId/data')
  @RequirePermission('privacy.data.export')
  @ApiOperation({ summary: 'Los datos entregados, en formato de datos (JSON)' })
  @ZodResponse({ status: HttpStatus.OK, type: PersonalDataReportResponse, description: 'Datos' })
  @ApiPrivacyErrors()
  async exportData(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ): Promise<PersonalDataReport> {
    return this.data.exportData(principal, id, exportId);
  }

  @Get('privacy-requests/:id/exports/:exportId/pdf')
  @RequirePermission('privacy.data.export')
  @ApiOperation({ summary: 'Los datos entregados, en PDF legible' })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: HttpStatus.OK, description: 'PDF' })
  @ApiPrivacyErrors()
  async exportPdf(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.data.exportPdf(principal, id, exportId);
    response.attachment(file.fileName);
    return new StreamableFile(file.content, { type: file.mimeType, length: file.sizeBytes });
  }
}
