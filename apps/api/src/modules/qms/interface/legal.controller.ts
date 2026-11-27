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
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  evaluateLegalRequirementSchema,
  importLegalRequirementsSchema,
  legalEvaluationListResponseSchema,
  legalImportResponseSchema,
  legalRequirementListResponseSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  saveLegalRequirementSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { LegalEvaluations } from '../application/legal-evaluations.js';
import { LegalImport } from '../application/legal-import.js';
import { LegalRequirements } from '../application/legal-requirements.js';

class LegalRequirementListResponse extends createZodDto(legalRequirementListResponseSchema) {}
class LegalEvaluationListResponse extends createZodDto(legalEvaluationListResponseSchema) {}
class LegalImportResponse extends createZodDto(legalImportResponseSchema) {}
class LegalRequirementBody extends createZodDto(saveLegalRequirementSchema) {}
class LegalEvaluationBody extends createZodDto(evaluateLegalRequirementSchema) {}
class LegalImportBody extends createZodDto(importLegalRequirementsSchema) {}
class LegalRequirementCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
class LegalEvaluationCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Normograma (RE-DG-001) y evaluación del cumplimiento legal (B46, ficha 17.17).

@ApiTags('Dirección')
@Controller('v1/qms/legal-requirements')
@ApiPermissionErrors()
export class LegalController {
  constructor(
    @Inject(LegalRequirements) private readonly requirements: LegalRequirements,
    @Inject(LegalEvaluations) private readonly evaluations: LegalEvaluations,
    @Inject(LegalImport) private readonly loader: LegalImport,
  ) {}

  @Get()
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar el normograma con la última evaluación de cada requisito' })
  @ZodResponse({ status: HttpStatus.OK, type: LegalRequirementListResponse, description: 'Lista' })
  async list(@CurrentPrincipal() principal: Principal): Promise<LegalRequirementListResponse> {
    return this.requirements.list(principal);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Descargar el normograma (CSV)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.requirements.export(principal, meta);
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('qms.legal.manage')
  @ApiOperation({
    summary: 'Revisar o cargar el normograma desde un archivo CSV',
    description: 'Con «apply» en falso solo revisa. Con un solo error no guarda nada.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: LegalImportResponse, description: 'Informe' })
  async import(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: LegalImportBody,
  ): Promise<LegalImportResponse> {
    return this.loader.run(principal, meta, input);
  }

  @Post()
  @RequirePermission('qms.legal.manage')
  @ApiOperation({ summary: 'Registrar un requisito legal' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: LegalRequirementCodeResponse,
    description: 'Hecho',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: LegalRequirementBody,
  ): Promise<LegalRequirementCodeResponse> {
    return this.requirements.create(principal, meta, input);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.legal.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un requisito legal' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: LegalRequirementBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.requirements.update(principal, meta, target, input);
  }

  @Get(':id/evaluations')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Ver todas las evaluaciones de un requisito' })
  @ZodResponse({ status: HttpStatus.OK, type: LegalEvaluationListResponse, description: 'Lista' })
  async history(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<LegalEvaluationListResponse> {
    return { data: await this.requirements.evaluations(principal, id) };
  }

  @Post(':id/evaluations')
  @RequirePermission('qms.legal.evaluate')
  @ApiOperation({
    summary: 'Evaluar el cumplimiento de un requisito',
    description: 'Un resultado parcial o negativo abre su acción de mejora en la misma operación.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: LegalEvaluationCreatedResponse,
    description: 'Evaluación',
  })
  async evaluate(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: LegalEvaluationBody,
  ): Promise<LegalEvaluationCreatedResponse> {
    return this.evaluations.evaluate(principal, meta, id, input);
  }
}
