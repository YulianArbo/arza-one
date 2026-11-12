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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  accountingExportRequestSchema,
  certifiableHoursQuerySchema,
  certifiableHoursResponseSchema,
  certifiableProjectsResponseSchema,
  costCertificationListResponseSchema,
  createCostCertificationSchema,
  errorResponseSchema,
  exportBatchListResponseSchema,
  financePeriodListResponseSchema,
  invoiceCreatedResponseSchema,
  reconciliationListResponseSchema,
  saveReconciliationSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AccountingUseCase, type AccountingFile } from '../application/accounting.js';
import { CostCertificationsUseCase } from '../application/cost-certifications.js';
import { ReconciliationsUseCase } from '../application/reconciliations.js';

class ReconciliationListResponse extends createZodDto(reconciliationListResponseSchema) {}
class SaveReconciliation extends createZodDto(saveReconciliationSchema) {}
class CostCertificationListResponse extends createZodDto(costCertificationListResponseSchema) {}
class CreateCostCertification extends createZodDto(createCostCertificationSchema) {}
class CertifiableHoursQuery extends createZodDto(certifiableHoursQuerySchema) {}
class CertifiableHoursResponse extends createZodDto(certifiableHoursResponseSchema) {}
class CertifiableProjectsResponse extends createZodDto(certifiableProjectsResponseSchema) {}
class PeriodListResponse extends createZodDto(financePeriodListResponseSchema) {}
class PeriodRequest extends createZodDto(accountingExportRequestSchema) {}
class ExportBatchListResponse extends createZodDto(exportBatchListResponseSchema) {}
class CreatedResponse extends createZodDto(invoiceCreatedResponseSchema) {}
class FinErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', description: 'Versión de la conciliación', required: true };
const CONFLICT = {
  status: HttpStatus.CONFLICT,
  type: FinErrorResponse.Output,
  description: 'Mes cerrado, estado o versión distinta',
};
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: FinErrorResponse.Output,
  description: 'Datos no válidos',
};

function sendFile(response: Response, file: AccountingFile): string {
  response.attachment(file.fileName);
  response.setHeader('X-Export-Batch-Id', file.batchId);
  return file.content;
}

@ApiTags('Finanzas')
@Controller('v1/finance')
@ApiPermissionErrors()
export class AccountingController {
  constructor(
    @Inject(ReconciliationsUseCase) private readonly reconciliations: ReconciliationsUseCase,
    @Inject(CostCertificationsUseCase) private readonly certifications: CostCertificationsUseCase,
    @Inject(AccountingUseCase) private readonly accounting: AccountingUseCase,
  ) {}

  @RequirePermission('finance.ledger.read')
  @Get('bank-reconciliations')
  @ApiOperation({ summary: 'Conciliaciones bancarias' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: ReconciliationListResponse,
    description: 'Conciliaciones',
  })
  async reconciliationList(
    @CurrentPrincipal() principal: Principal,
  ): Promise<ReconciliationListResponse> {
    return { data: await this.reconciliations.list(principal) };
  }

  @RequirePermission('finance.reconciliation.manage')
  @Post('bank-reconciliations')
  @ApiOperation({ summary: 'Registrar la conciliación de una cuenta en un mes, en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Conciliación' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  async createReconciliation(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SaveReconciliation,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return { id: await this.reconciliations.create({ principal, meta }, body) };
  }

  @RequirePermission('finance.reconciliation.manage')
  @Put('bank-reconciliations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar una conciliación en borrador' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiResponse(CONFLICT)
  async updateReconciliation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SaveReconciliation,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.reconciliations.update({ principal, meta }, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('finance.reconciliation.manage')
  @Post('bank-reconciliations/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cerrar una conciliación cuando no queda diferencia sin explicar' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Conciliada' })
  @ApiResponse(INVALID)
  async closeReconciliation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.reconciliations.close({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('finance.ledger.read')
  @Get('cost-certifications')
  @ApiOperation({ summary: 'Certificaciones de costos de desarrollo' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: CostCertificationListResponse,
    description: 'Certificaciones',
  })
  async certificationList(
    @CurrentPrincipal() principal: Principal,
  ): Promise<CostCertificationListResponse> {
    return { data: await this.certifications.list(principal) };
  }

  @RequirePermission('finance.cost_certification.manage')
  @Get('cost-certifications/projects')
  @ApiOperation({ summary: 'Proyectos que se pueden certificar' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: CertifiableProjectsResponse,
    description: 'Proyectos',
  })
  async certifiableProjects(
    @CurrentPrincipal() principal: Principal,
  ): Promise<CertifiableProjectsResponse> {
    return { data: await this.certifications.projects(principal) };
  }

  @RequirePermission('finance.cost_certification.manage')
  @Get('cost-certifications/hours')
  @ApiOperation({ summary: 'Horas aprobadas de un proyecto en un mes' })
  @ZodResponse({ status: HttpStatus.OK, type: CertifiableHoursResponse, description: 'Horas' })
  async certifiableHours(
    @CurrentPrincipal() principal: Principal,
    @Query() query: CertifiableHoursQuery,
  ): Promise<CertifiableHoursResponse> {
    return {
      data: { hours: await this.certifications.hours(principal, query.project_id, query.period) },
    };
  }

  @RequirePermission('finance.cost_certification.manage')
  @Post('cost-certifications')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Certificar los costos de desarrollo de un proyecto en un mes' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Certificación' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  async createCertification(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: CreateCostCertification,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return {
      id: await this.certifications.create({ principal, meta }, idempotencyKeyFrom(header), body),
    };
  }

  @RequirePermission('finance.ledger.read')
  @Get('periods')
  @ApiOperation({ summary: 'Meses contables: abiertos, cerrados y si se pueden cerrar' })
  @ZodResponse({ status: HttpStatus.OK, type: PeriodListResponse, description: 'Meses' })
  async periods(@CurrentPrincipal() principal: Principal): Promise<PeriodListResponse> {
    return { data: await this.accounting.periods(principal) };
  }

  @RequirePermission('finance.period.close')
  @Post('periods/close')
  @ApiOperation({
    summary: 'Cerrar un mes contable',
    description: 'Genera el lote definitivo de la exportación. Un mes cerrado no admite cambios.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: CreatedResponse,
    description: 'Lote definitivo',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: FinErrorResponse.Output,
    description: 'El mes no ha terminado, ya está cerrado o tiene gastos sin decidir',
  })
  async closePeriod(
    @CurrentPrincipal() principal: Principal,
    @Body() body: PeriodRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return { id: await this.accounting.close({ principal, meta }, body.period) };
  }

  @RequirePermission('finance.export')
  @Get('exports')
  @ApiOperation({ summary: 'Lotes exportados al software contable' })
  @ZodResponse({ status: HttpStatus.OK, type: ExportBatchListResponse, description: 'Lotes' })
  async batches(@CurrentPrincipal() principal: Principal): Promise<ExportBatchListResponse> {
    return { data: await this.accounting.batches(principal) };
  }

  @RequirePermission('finance.export')
  @Post('exports/accounting')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar un mes al archivo contable (CSV)',
    description: 'Mes cerrado: su lote definitivo. Mes abierto: un lote preliminar nuevo.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  @ApiResponse(INVALID)
  async exportAccounting(
    @CurrentPrincipal() principal: Principal,
    @Body() body: PeriodRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return sendFile(response, await this.accounting.export({ principal, meta }, body.period));
  }

  @RequirePermission('finance.export')
  @Get('exports/:id/file')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Volver a descargar el archivo de un lote definitivo' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  @ApiResponse(CONFLICT)
  async downloadBatch(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return sendFile(response, await this.accounting.download({ principal, meta }, id));
  }
}
