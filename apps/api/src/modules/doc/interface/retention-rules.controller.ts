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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createRetentionRuleSchema,
  retentionRuleListResponseSchema,
  unassignedDocumentsResponseSchema,
  updateRetentionRuleSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { RetentionRulesUseCase } from '../application/retention-rules.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class RetentionRuleListResponse extends createZodDto(retentionRuleListResponseSchema) {}
class UnassignedDocumentsResponse extends createZodDto(unassignedDocumentsResponseSchema) {}
class CreateRetentionRule extends createZodDto(createRetentionRuleSchema) {}
class UpdateRetentionRule extends createZodDto(updateRetentionRuleSchema) {}

/** Tabla de retención (M03, B21; RE-SGC-005). La administra Calidad. */
@ApiTags('Documentos')
@Controller('v1/retention-rules')
@ApiPermissionErrors()
export class RetentionRulesController {
  constructor(@Inject(RetentionRulesUseCase) private readonly rules: RetentionRulesUseCase) {}

  @RequirePermission('doc.retention.manage')
  @Get()
  @ApiOperation({
    summary: 'Tabla de retención',
    description:
      'Cada regla con cuántos documentos toma hoy, y cuántos documentos no tienen regla.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: RetentionRuleListResponse, description: 'Reglas' })
  async list(@CurrentPrincipal() principal: Principal): Promise<RetentionRuleListResponse> {
    return this.rules.list(principal);
  }

  @RequirePermission('doc.retention.manage')
  @Get('unassigned-documents')
  @ApiOperation({
    summary: 'Documentos sin regla de retención',
    description: 'Los primeros 100 en orden de código, y el total.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: UnassignedDocumentsResponse, description: 'Lista' })
  async unassigned(@CurrentPrincipal() principal: Principal): Promise<UnassignedDocumentsResponse> {
    return this.rules.unassigned(principal);
  }

  @RequirePermission('doc.retention.manage')
  @Post()
  @ApiOperation({
    summary: 'Crear una regla de retención',
    description: 'Una serie del RE-SGC-005 para un tipo, un proceso o los dos.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creada' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateRetentionRule,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.rules.create(principal, body, meta) };
  }

  @RequirePermission('doc.retention.manage')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar o desactivar una regla de retención',
    description: 'El código no cambia. Una regla inactiva deja de aplicarse.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateRetentionRule,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.rules.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }
}
