import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  assignPqrsfRequestSchema,
  classifyPqrsfRequestSchema,
  createPqrsfRequestSchema,
  pqrsfDetailSchema,
  pqrsfListQuerySchema,
  pqrsfListResponseSchema,
  pqrsfOptionsSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PqrsfIntakeUseCase } from '../application/pqrsf-intake.js';
import { PqrsfQueries } from '../application/pqrsf-queries.js';
import { PqrsfStepsUseCase } from '../application/pqrsf-steps.js';
import {
  ApiServiceIfMatch,
  ApiServiceWriteErrors,
  ServiceCreatedResponse,
  UUID,
} from './service-openapi.js';

class PqrsfListQuery extends createZodDto(pqrsfListQuerySchema) {}
class PqrsfListResponse extends createZodDto(pqrsfListResponseSchema) {}
class PqrsfDetailResponse extends createZodDto(pqrsfDetailSchema) {}
class PqrsfOptionsResponse extends createZodDto(pqrsfOptionsSchema) {}
class CreatePqrsfRequest extends createZodDto(createPqrsfRequestSchema) {}
class ClassifyPqrsfRequest extends createZodDto(classifyPqrsfRequestSchema) {}
class AssignPqrsfRequest extends createZodDto(assignPqrsfRequestSchema) {}

/** PQRSF: bandeja, ficha, registro interno, clasificación y asignación (M08, B29; ficha 17.9). */
@ApiTags('Servicio')
@Controller('v1/pqrsf')
@ApiPermissionErrors()
export class PqrsfController {
  constructor(
    @Inject(PqrsfQueries) private readonly queries: PqrsfQueries,
    @Inject(PqrsfIntakeUseCase) private readonly intake: PqrsfIntakeUseCase,
    @Inject(PqrsfStepsUseCase) private readonly steps: PqrsfStepsUseCase,
  ) {}

  @RequirePermission('service.pqrsf.read')
  @Get()
  @ApiOperation({
    summary: 'Bandeja de PQRSF',
    description: 'Por vista; la que vence primero, arriba.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PqrsfListResponse, description: 'PQRSF' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: PqrsfListQuery,
  ): Promise<PqrsfListResponse> {
    return this.queries.list(principal, ability, query);
  }

  @RequirePermission('service.pqrsf.classify')
  @Get('options')
  @ApiOperation({ summary: 'A quién se asigna', description: 'Servicio y Líder técnico activos.' })
  @ZodResponse({ status: HttpStatus.OK, type: PqrsfOptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<PqrsfOptionsResponse> {
    return this.queries.options(principal);
  }

  @RequirePermission('service.pqrsf.classify')
  @Post()
  @ApiOperation({
    summary: 'Registrar una PQRSF',
    description: 'La que llegó por correo, teléfono o en persona. Recibe radicado y plazo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ServiceCreatedResponse, description: 'Creada' })
  @ApiServiceWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreatePqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceCreatedResponse> {
    return { id: await this.intake.create(principal, body, meta) };
  }

  @RequirePermission('service.pqrsf.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ficha de la PQRSF', description: 'Con su plazo y lo que puede hacer.' })
  @ZodResponse({ status: HttpStatus.OK, type: PqrsfDetailResponse, description: 'PQRSF' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<PqrsfDetailResponse> {
    return this.queries.detail(principal, ability, id);
  }

  @RequirePermission('service.pqrsf.classify')
  @Post(':id/actions/classify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Clasificar',
    description:
      'Tipo, datos personales, tercero y responsable. Recalcula el plazo; si trata de datos personales, la traslada a Privacidad.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Clasificada' })
  @ApiServiceWriteErrors()
  async classify(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ClassifyPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.classify(principal, target, body, meta);
  }

  @RequirePermission('service.pqrsf.classify')
  @Post(':id/actions/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reasignar',
    description: 'A otra persona de Servicio o Líder técnico.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Asignada' })
  @ApiServiceWriteErrors()
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AssignPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.assign(principal, target, body, meta);
  }
}
