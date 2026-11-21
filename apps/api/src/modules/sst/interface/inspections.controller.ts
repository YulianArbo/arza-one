import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  checklistResponseSchema,
  inspectionKindSchema,
  inspectionListResponseSchema,
  recordInspectionSchema,
  requestHomeInspectionSchema,
  reviewInspectionSchema,
  sstCreatedResponseSchema,
  type InspectionKind,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Inspections } from '../application/inspections.js';

class SstInspectionListResponse extends createZodDto(inspectionListResponseSchema) {}
class SstChecklistResponse extends createZodDto(checklistResponseSchema) {}
class SstRecordBody extends createZodDto(recordInspectionSchema) {}
class SstHomeRequestBody extends createZodDto(requestHomeInspectionSchema) {}
class SstReviewBody extends createZodDto(reviewInspectionSchema) {}
class SstCreatedResponse extends createZodDto(sstCreatedResponseSchema) {}
const KIND = new ParseEnumPipe(inspectionKindSchema.enum);

// Inspecciones de instalaciones, emergencias y puesto de trabajo en casa (B37, decisión 11).

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst/inspections')
@ApiPermissionErrors()
export class InspectionsController {
  constructor(@Inject(Inspections) private readonly inspections: Inspections) {}

  @Get()
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar las inspecciones' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: SstInspectionListResponse,
    description: 'Inspecciones',
  })
  async list(@CurrentPrincipal() principal: Principal): Promise<SstInspectionListResponse> {
    return { data: await this.inspections.list(principal) };
  }

  @Get('checklists/:kind')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar la lista de chequeo de un tipo de inspección' })
  @ZodResponse({ status: HttpStatus.OK, type: SstChecklistResponse, description: 'Lista' })
  async checklist(
    @CurrentPrincipal() principal: Principal,
    @Param('kind', KIND) kind: InspectionKind,
  ): Promise<SstChecklistResponse> {
    return { kind, data: await this.inspections.checklist(principal, kind) };
  }

  @Post()
  @RequirePermission('sst.inspection.manage')
  @ApiOperation({ summary: 'Registrar una inspección de instalaciones o de emergencias' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Registrada' })
  async record(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: SstRecordBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.inspections.record(principal, meta, input) };
  }

  @Post('home-requests')
  @RequirePermission('sst.inspection.manage')
  @ApiOperation({ summary: 'Pedir a un colaborador la autoinspección de su puesto en casa' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Solicitada' })
  async requestHome(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: SstHomeRequestBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.inspections.requestHome(principal, meta, input) };
  }

  @Post(':id/actions/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.inspection.manage')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la inspección' })
  @ApiOperation({ summary: 'Revisar una autoinspección y dejar los hallazgos' })
  async review(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstReviewBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.inspections.review(principal, meta, target, input);
  }
}
