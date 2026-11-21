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
  lessonListResponseSchema,
  qmsCreatedResponseSchema,
  qmsRiskListResponseSchema,
  saveLessonSchema,
  saveQmsRiskSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Lessons } from '../application/lessons.js';
import { Risks } from '../application/risks.js';

class QmsRiskListResponse extends createZodDto(qmsRiskListResponseSchema) {}
class QmsRiskBody extends createZodDto(saveQmsRiskSchema) {}
class QmsLessonListResponse extends createZodDto(lessonListResponseSchema) {}
class QmsLessonBody extends createZodDto(saveLessonSchema) {}
class QmsCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Riesgos y oportunidades (decisión 9) y lecciones aprendidas (B38, ficha 17.15).

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class RisksController {
  constructor(
    @Inject(Risks) private readonly risks: Risks,
    @Inject(Lessons) private readonly lessons: Lessons,
  ) {}

  @Get('risks')
  @RequirePermission('qms.read')
  @ApiOperation({
    summary: 'Consultar los riesgos y oportunidades, del valor más alto al más bajo',
  })
  @ZodResponse({ status: HttpStatus.OK, type: QmsRiskListResponse, description: 'Matriz' })
  async listRisks(@CurrentPrincipal() principal: Principal): Promise<QmsRiskListResponse> {
    return { data: await this.risks.list(principal) };
  }

  @Post('risks')
  @RequirePermission('qms.risk.manage')
  @ApiOperation({
    summary: 'Registrar un riesgo o una oportunidad; la plataforma calcula el nivel',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCreatedResponse, description: 'Registrado' })
  async createRisk(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsRiskBody,
  ): Promise<QmsCreatedResponse> {
    return { id: await this.risks.create(principal, meta, input) };
  }

  @Patch('risks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.risk.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar o retirar un riesgo y su valoración' })
  async updateRisk(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsRiskBody,
  ): Promise<void> {
    await this.risks.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('lessons')
  @RequirePermission('qms.lesson.read')
  @ApiOperation({ summary: 'Consultar las lecciones aprendidas' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsLessonListResponse, description: 'Lecciones' })
  async listLessons(@CurrentPrincipal() principal: Principal): Promise<QmsLessonListResponse> {
    return { data: await this.lessons.list(principal) };
  }

  @Post('lessons')
  @RequirePermission('qms.process.manage')
  @ApiOperation({ summary: 'Registrar una lección aprendida' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCreatedResponse, description: 'Registrada' })
  async createLesson(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsLessonBody,
  ): Promise<QmsCreatedResponse> {
    return { id: await this.lessons.create(principal, meta, input) };
  }

  @Patch('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.process.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar una lección aprendida' })
  async updateLesson(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsLessonBody,
  ): Promise<void> {
    await this.lessons.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }
}
