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
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addFindingSchema,
  auditDetailResponseSchema,
  auditListResponseSchema,
  cancelAuditSchema,
  findingActionSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  reportAuditSchema,
  saveChecklistSchema,
  startAuditSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AuditSteps } from '../application/audit-steps.js';
import { Audits } from '../application/audits.js';

class QmsStartAuditBody extends createZodDto(startAuditSchema) {}
class QmsChecklistBody extends createZodDto(saveChecklistSchema) {}
class QmsFindingBody extends createZodDto(addFindingSchema) {}
class QmsReportAuditBody extends createZodDto(reportAuditSchema) {}
class QmsCancelAuditBody extends createZodDto(cancelAuditSchema) {}
class QmsFindingActionBody extends createZodDto(findingActionSchema) {}
class QmsMyAuditsResponse extends createZodDto(auditListResponseSchema) {}
class QmsMyAuditResponse extends createZodDto(auditDetailResponseSchema) {}
class QmsFindingCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
class QmsFindingActionResponse extends createZodDto(qmsCodeResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Ejecución de una auditoría (B39): el auditor asignado la inicia, diligencia la lista de chequeo
// (RE-SGC-003), registra hallazgos y emite el informe (RE-SGC-004). Calidad la cierra o la cancela.

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class AuditStepsController {
  constructor(
    @Inject(Audits) private readonly audits: Audits,
    @Inject(AuditSteps) private readonly steps: AuditSteps,
  ) {}

  @Get('my/audits')
  @RequirePermission('qms.audit.execute')
  @ApiOperation({ summary: 'Las auditorías que me asignaron' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsMyAuditsResponse, description: 'Lista' })
  async myAudits(@CurrentPrincipal() principal: Principal): Promise<QmsMyAuditsResponse> {
    return { data: await this.audits.mine(principal) };
  }

  @Get('my/audits/:id')
  @RequirePermission('qms.audit.execute')
  @ApiOperation({ summary: 'Ver una auditoría que me asignaron' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsMyAuditResponse, description: 'Auditoría' })
  async myAudit(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<QmsMyAuditResponse> {
    return this.audits.detail({ principal, ability }, id);
  }

  @Post('audits/:id/actions/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.execute')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Iniciar la auditoría' })
  async start(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsStartAuditBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.start({ principal, ability }, meta, target, input);
  }

  @Put('audits/:id/checklist')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.execute')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Guardar la lista de chequeo (RE-SGC-003)' })
  async checklist(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsChecklistBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.saveChecklist({ principal, ability }, meta, target, input);
  }

  @Post('audits/:id/findings')
  @RequirePermission('qms.audit.execute')
  @ApiOperation({ summary: 'Registrar un hallazgo de la auditoría' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: QmsFindingCreatedResponse,
    description: 'Hecho',
  })
  async addFinding(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: QmsFindingBody,
  ): Promise<QmsFindingCreatedResponse> {
    return { id: await this.steps.addFinding({ principal, ability }, meta, id, input) };
  }

  @Post('audits/:id/actions/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.execute')
  @ApiHeader(IF_MATCH)
  @ApiOperation({
    summary: 'Emitir el informe; los hallazgos de no conformidad abren su no conformidad',
  })
  async report(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsReportAuditBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.report({ principal, ability }, meta, target, input);
  }

  @Post('audits/:id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.plan')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cerrar la auditoría con informe' })
  async close(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.close({ principal, ability }, meta, target);
  }

  @Post('audits/:id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.audit.plan')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cancelar una auditoría programada o en ejecución' })
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsCancelAuditBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.cancel({ principal, ability }, meta, target, input);
  }

  @Post('findings/:id/actions/action')
  @RequirePermission('qms.action.manage')
  @ApiOperation({ summary: 'Convertir una observación u oportunidad en acción de mejora' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsFindingActionResponse, description: 'Hecho' })
  async findingAction(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: QmsFindingActionBody,
  ): Promise<QmsFindingActionResponse> {
    return this.steps.findingAction({ principal, ability }, meta, id, input);
  }
}
