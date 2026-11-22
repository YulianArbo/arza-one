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
  Patch,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditDetailResponseSchema,
  auditFindingListResponseSchema,
  auditProgramListResponseSchema,
  planAuditSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  saveAuditProgramSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AuditPrograms } from '../application/audit-programs.js';
import { Audits } from '../application/audits.js';

class QmsAuditProgramListResponse extends createZodDto(auditProgramListResponseSchema) {}
class QmsAuditProgramBody extends createZodDto(saveAuditProgramSchema) {}
class QmsPlanAuditBody extends createZodDto(planAuditSchema) {}
class QmsAuditDetailResponse extends createZodDto(auditDetailResponseSchema) {}
class QmsAuditFindingListResponse extends createZodDto(auditFindingListResponseSchema) {}
class QmsAuditCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
class QmsAuditCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Programa anual y planeación de auditorías internas (B39, decisiones 1, 2 y 4).

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class AuditsController {
  constructor(
    @Inject(AuditPrograms) private readonly programs: AuditPrograms,
    @Inject(Audits) private readonly audits: Audits,
  ) {}

  @Get('audit-programs')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar los programas de auditoría con sus auditorías' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsAuditProgramListResponse, description: 'Lista' })
  async listPrograms(
    @CurrentPrincipal() principal: Principal,
  ): Promise<QmsAuditProgramListResponse> {
    return { data: await this.programs.list(principal) };
  }

  @Post('audit-programs')
  @RequirePermission('qms.audit.plan')
  @ApiOperation({ summary: 'Crear el programa anual de auditorías (uno por año)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsAuditCreatedResponse, description: 'Creado' })
  async createProgram(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsAuditProgramBody,
  ): Promise<QmsAuditCreatedResponse> {
    return { id: await this.programs.create(principal, meta, input) };
  }

  @Patch('audit-programs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.plan')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar el programa de auditorías' })
  async updateProgram(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsAuditProgramBody,
  ): Promise<void> {
    await this.programs.update(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      input,
    );
  }

  @Post('audit-programs/:id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.plan')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Publicar el programa de auditorías' })
  async publishProgram(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.programs.publish(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post('audits')
  @RequirePermission('qms.audit.plan')
  @ApiOperation({
    summary: 'Programar una auditoría; el auditor no puede ser del proceso auditado',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsAuditCodeResponse, description: 'Creada' })
  async plan(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsPlanAuditBody,
  ): Promise<QmsAuditCodeResponse> {
    return this.audits.plan(principal, meta, input);
  }

  @Patch('audits/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.plan')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Reprogramar una auditoría programada o cambiar su auditor' })
  async replan(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsPlanAuditBody,
  ): Promise<void> {
    await this.audits.replan(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('audits/:id')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Ver una auditoría con su lista de chequeo y sus hallazgos' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsAuditDetailResponse, description: 'Auditoría' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<QmsAuditDetailResponse> {
    return this.audits.detail({ principal, ability }, id);
  }

  @Get('findings')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar los hallazgos de todas las auditorías' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsAuditFindingListResponse, description: 'Lista' })
  async findings(@CurrentPrincipal() principal: Principal): Promise<QmsAuditFindingListResponse> {
    return { data: await this.audits.findings(principal) };
  }
}
