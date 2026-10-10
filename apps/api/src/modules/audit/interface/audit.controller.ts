import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  auditEventListQuerySchema,
  auditEventListResponseSchema,
  auditExportListQuerySchema,
  auditExportListResponseSchema,
  auditExportRequestSchema,
  chainVerificationSchema,
  entityHistoryParamsSchema,
  entityHistoryQuerySchema,
  errorResponseSchema,
  securityEventListQuerySchema,
  securityEventListResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AuditExportUseCase } from '../application/audit-export.js';
import { AuditQuery } from '../application/audit-query.js';
import { ChainVerificationUseCase } from '../application/chain-verification.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class AuditEventListQuery extends createZodDto(auditEventListQuerySchema) {}
class AuditEventListResponse extends createZodDto(auditEventListResponseSchema) {}
class EntityHistoryParams extends createZodDto(entityHistoryParamsSchema) {}
class EntityHistoryQuery extends createZodDto(entityHistoryQuerySchema) {}
class SecurityEventListQuery extends createZodDto(securityEventListQuerySchema) {}
class SecurityEventListResponse extends createZodDto(securityEventListResponseSchema) {}
class AuditExportRequest extends createZodDto(auditExportRequestSchema) {}
class AuditExportListQuery extends createZodDto(auditExportListQuerySchema) {}
class AuditExportListResponse extends createZodDto(auditExportListResponseSchema) {}
class ChainVerificationResponse extends createZodDto(chainVerificationSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/**
 * M19 Auditoría (B11, ficha 17.20, numeral 14.4): consulta de eventos, historial de un registro,
 * eventos de seguridad, exportación y verificación de la cadena. Toda consulta queda auditada.
 */
@ApiTags('Auditoría')
@Controller('v1')
@ApiPermissionErrors()
export class AuditController {
  constructor(
    @Inject(AuditQuery) private readonly query: AuditQuery,
    @Inject(AuditExportUseCase) private readonly exporter: AuditExportUseCase,
    @Inject(ChainVerificationUseCase) private readonly chain: ChainVerificationUseCase,
  ) {}

  @RequirePermission('audit.event.read')
  @Get('audit-events')
  @ApiOperation({ summary: 'Eventos de auditoría de la empresa, del más reciente al más antiguo' })
  @ZodResponse({ status: HttpStatus.OK, type: AuditEventListResponse, description: 'Una página' })
  async events(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AuditEventListQuery,
    @Meta() meta: RequestMeta,
  ): Promise<AuditEventListResponse> {
    return this.query.events(principal, query, meta);
  }

  @RequirePermission('audit.event.read')
  @Get('entities/:type/:id/history')
  @ApiOperation({ summary: 'Historial de un registro: todo lo que le pasó' })
  @ZodResponse({ status: HttpStatus.OK, type: AuditEventListResponse, description: 'Una página' })
  async history(
    @CurrentPrincipal() principal: Principal,
    @Param() target: EntityHistoryParams,
    @Query() query: EntityHistoryQuery,
    @Meta() meta: RequestMeta,
  ): Promise<AuditEventListResponse> {
    return this.query.history(principal, target, query, meta);
  }

  @RequirePermission('audit.security.read')
  @Get('security-events')
  @ApiOperation({ summary: 'Eventos de seguridad: bloqueos, alertas y daños de la cadena' })
  @ZodResponse({ status: HttpStatus.OK, type: SecurityEventListResponse, description: 'Página' })
  async securityEvents(
    @CurrentPrincipal() principal: Principal,
    @Query() query: SecurityEventListQuery,
    @Meta() meta: RequestMeta,
  ): Promise<SecurityEventListResponse> {
    return this.query.securityEvents(principal, query, meta);
  }

  @RequirePermission('audit.event.read')
  @Get('audit-exports')
  @ApiOperation({ summary: 'Exportaciones de la auditoría hechas: quién, cuándo y qué' })
  @ZodResponse({ status: HttpStatus.OK, type: AuditExportListResponse, description: 'Página' })
  async exports(
    @CurrentPrincipal() principal: Principal,
    @Query() query: AuditExportListQuery,
    @Meta() meta: RequestMeta,
  ): Promise<AuditExportListResponse> {
    return this.query.exports(principal, query, meta);
  }

  @RequirePermission('audit.event.export')
  @RecentAuthentication()
  @Post('audit-exports')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar la auditoría a CSV',
    description: 'Con los mismos filtros de la consulta. Exige confirmar la identidad.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Demasiados eventos: acote el periodo',
  })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AuditExportRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.exporter.export(principal, body, meta);
    response.attachment(file.fileName);
    return file.content;
  }

  @RequirePermission('audit.chain.verify')
  @Post('audit-events/verify-chain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar que ningún evento falte, sobre ni haya cambiado' })
  @ZodResponse({ status: HttpStatus.OK, type: ChainVerificationResponse, description: 'Resultado' })
  async verifyChain(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<ChainVerificationResponse> {
    return this.chain.verify(principal, meta);
  }
}
