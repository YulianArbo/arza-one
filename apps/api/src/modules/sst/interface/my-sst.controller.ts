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
  answerHomeInspectionSchema,
  myMedicalExamsSchema,
  mySstSchema,
  quickReportResponseSchema,
  quickReportSchema,
  sstRefListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Inspections } from '../application/inspections.js';
import { MedicalExams } from '../application/medical-exams.js';
import { MySstQueries } from '../application/my-sst.js';
import { PpeDeliveries } from '../application/ppe.js';
import { QuickReports } from '../application/quick-reports.js';

class MySstResponse extends createZodDto(mySstSchema) {}
class MyExamsResponse extends createZodDto(myMedicalExamsSchema) {}
class ReportBody extends createZodDto(quickReportSchema) {}
class ReportResponse extends createZodDto(quickReportResponseSchema) {}
class AnswerBody extends createZodDto(answerHomeInspectionSchema) {}
class RefListResponse extends createZodDto(sstRefListResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Lo de SST de cada colaborador (B37): el reporte desde el celular, sus reportes, su concepto de
// aptitud (consulta registrada), su autoinspección en casa y la confirmación de elementos.
// Todo colaborador tiene sst.incident.report limitado a lo propio.

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst')
@ApiPermissionErrors()
export class MySstController {
  constructor(
    @Inject(MySstQueries) private readonly queries: MySstQueries,
    @Inject(QuickReports) private readonly reports: QuickReports,
    @Inject(MedicalExams) private readonly exams: MedicalExams,
    @Inject(Inspections) private readonly inspections: Inspections,
    @Inject(PpeDeliveries) private readonly ppe: PpeDeliveries,
  ) {}

  @Get('me')
  @RequirePermission('sst.incident.report')
  @ApiOperation({ summary: 'Consultar lo propio de SST para «Mi espacio»' })
  @ZodResponse({ status: HttpStatus.OK, type: MySstResponse, description: 'Mi SST' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<MySstResponse> {
    return this.queries.summary(principal);
  }

  @Post('me/reports')
  @RequirePermission('sst.incident.report')
  @ApiIdempotencyKey()
  @ApiOperation({
    summary: 'Reportar una condición, un acto inseguro, un incidente o un accidente',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ReportResponse, description: 'Reportado' })
  async report(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReportBody,
  ): Promise<ReportResponse> {
    return this.reports.report(principal, meta, idempotencyKeyFrom(key), input);
  }

  @Post('me/medical-exams/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sst.incident.report')
  @ApiOperation({ summary: 'Consultar sus conceptos de aptitud; la consulta queda registrada' })
  @ZodResponse({ status: HttpStatus.OK, type: MyExamsResponse, description: 'Conceptos' })
  async myExams(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<MyExamsResponse> {
    return { data: await this.exams.mine(principal, meta) };
  }

  @Post('me/inspections/:id/answers')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.report')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Responder la autoinspección de su puesto de trabajo en casa' })
  async answer(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: AnswerBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.inspections.answerHome(principal, meta, target, input);
  }

  @Post('me/ppe-deliveries/:id/actions/acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.report')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Confirmar que recibió un elemento de protección' })
  async acknowledge(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.ppe.acknowledge(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Get('employees')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Colaboradores activos, para los formularios de SST' })
  @ZodResponse({ status: HttpStatus.OK, type: RefListResponse, description: 'Colaboradores' })
  async employees(@CurrentPrincipal() principal: Principal): Promise<RefListResponse> {
    return { data: await this.queries.employees(principal) };
  }

  @Get('people')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Cuentas activas, para responsables e integrantes de comités' })
  @ZodResponse({ status: HttpStatus.OK, type: RefListResponse, description: 'Personas' })
  async people(@CurrentPrincipal() principal: Principal): Promise<RefListResponse> {
    return { data: await this.queries.people(principal) };
  }
}
