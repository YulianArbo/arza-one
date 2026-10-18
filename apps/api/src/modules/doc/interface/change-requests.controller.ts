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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  changeRequestListQuerySchema,
  changeRequestListResponseSchema,
  changeRequestSchema,
  changeRequestStepRequestSchema,
  changeRequestStepSchema,
  createChangeRequestSchema,
  type ChangeRequestStep,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ChangeRequestsUseCase } from '../application/change-requests.js';
import { transitionNotAllowed } from '../application/doc-messages.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class ChangeRequestListQuery extends createZodDto(changeRequestListQuerySchema) {}
class ChangeRequestListResponse extends createZodDto(changeRequestListResponseSchema) {}
class ChangeRequestResponse extends createZodDto(changeRequestSchema) {}
class CreateChangeRequest extends createZodDto(createChangeRequestSchema) {}
class ChangeRequestStepRequest extends createZodDto(changeRequestStepRequestSchema) {}

const UUID = new ParseUUIDPipe();

/** El paso de la ruta: empezar el análisis, aprobar o rechazar; otro no está permitido. */
class StepPipe {
  transform(value: unknown): ChangeRequestStep {
    const parsed = changeRequestStepSchema.safeParse(value);
    if (!parsed.success) throw transitionNotAllowed();
    return parsed.data;
  }
}

/** Solicitudes de Acción Documental (M03, B19; FT-SGC-001). */
@ApiTags('Documentos')
@Controller('v1/change-requests')
@ApiPermissionErrors()
export class ChangeRequestsController {
  constructor(@Inject(ChangeRequestsUseCase) private readonly requests: ChangeRequestsUseCase) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Listar las solicitudes de acción documental',
    description: 'Quien solo ve lo propio ve las que pidió. Con «usable», las aprobadas sin usar.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ChangeRequestListResponse, description: 'Página' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: ChangeRequestListQuery,
  ): Promise<ChangeRequestListResponse> {
    return this.requests.list(principal, ability, query);
  }

  @RequirePermission('doc.change_request.create')
  @Post()
  @ApiOperation({
    summary: 'Radicar una solicitud de acción documental',
    description:
      'Pide crear, modificar o eliminar un documento del SGC. Recibe el código SAD-AAAA-NNNN y su trámite le llega a Calidad.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Radicada' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateChangeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.requests.create(principal, ability, body, meta) };
  }

  @RequirePermission('doc.document.read')
  @Get(':id')
  @ApiOperation({ summary: 'Ver una solicitud', description: 'Con su paso actual y sus acciones.' })
  @ZodResponse({ status: HttpStatus.OK, type: ChangeRequestResponse, description: 'Solicitud' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<ChangeRequestResponse> {
    return this.requests.get(principal, ability, id);
  }

  @RequirePermission('doc.change_request.decide')
  @Post(':id/actions/:step')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'step', enum: changeRequestStepSchema.options })
  @ApiOperation({
    summary: 'Dar un paso de la solicitud',
    description:
      'Empezar el análisis, aprobar o rechazar (con comentario). Quien la pidió no la decide.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async step(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Param('step', StepPipe) step: ChangeRequestStep,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ChangeRequestStepRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.requests.step({ principal, ability, meta }, target, step, body);
  }
}
