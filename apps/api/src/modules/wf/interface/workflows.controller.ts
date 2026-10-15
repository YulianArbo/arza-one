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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createDefinitionRequestSchema,
  definitionListResponseSchema,
  definitionSchema,
  startTestInstanceRequestSchema,
  updateDefinitionRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { DefinitionsUseCase } from '../application/definitions.js';
import { ApiIfMatch, ApiWfWriteErrors, WfCreatedResponse } from './wf-openapi.js';

class CreateDefinitionRequest extends createZodDto(createDefinitionRequestSchema) {}
class UpdateDefinitionRequest extends createZodDto(updateDefinitionRequestSchema) {}
class StartTestInstanceRequest extends createZodDto(startTestInstanceRequestSchema) {}
class DefinitionResponse extends createZodDto(definitionSchema) {}
class DefinitionListResponse extends createZodDto(definitionListResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** Editor de flujos (ficha 17.5): definiciones versionadas que interpreta el motor (ADR-011). */
@ApiTags('Flujos')
@Controller('v1/workflows')
@ApiPermissionErrors()
@RequirePermission('wf.definition.manage')
export class WorkflowsController {
  constructor(@Inject(DefinitionsUseCase) private readonly definitions: DefinitionsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Flujos y sus versiones' })
  @ZodResponse({ status: HttpStatus.OK, type: DefinitionListResponse, description: 'Flujos' })
  async list(@CurrentPrincipal() principal: Principal): Promise<DefinitionListResponse> {
    return { data: await this.definitions.list(principal) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un flujo',
    description: 'Queda como borrador, versión 1. Se puede guardar con problemas; no publicar.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: WfCreatedResponse, description: 'Creado' })
  @ApiWfWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateDefinitionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<WfCreatedResponse> {
    return { id: await this.definitions.create(principal, body, meta) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una versión de un flujo, con sus estados, transiciones y problemas' })
  @ZodResponse({ status: HttpStatus.OK, type: DefinitionResponse, description: 'Flujo' })
  @ApiWfWriteErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<DefinitionResponse> {
    return this.definitions.get(principal, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar un borrador', description: 'Una versión publicada no cambia.' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiWfWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateDefinitionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const version = versionFromIfMatch(ifMatch);
    await this.definitions.update(principal, id, body, { request: meta, version });
  }

  @Post(':id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Publicar el borrador',
    description: 'Pasa a ser la versión vigente; la anterior queda retirada.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Publicado' })
  @ApiWfWriteErrors()
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.definitions.publish(principal, id, versionFromIfMatch(ifMatch), meta);
  }

  @Post(':id/actions/new-version')
  @ApiOperation({
    summary: 'Crear una versión nueva',
    description: 'Copia esta versión en un borrador con el número siguiente.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: WfCreatedResponse, description: 'Borrador' })
  @ApiWfWriteErrors()
  async newVersion(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<WfCreatedResponse> {
    return { id: await this.definitions.newVersion(principal, id, meta) };
  }

  @Post(':id/actions/start-test')
  @ApiOperation({
    summary: 'Iniciar un trámite de prueba',
    description: 'Con la versión publicada, para ensayar el flujo antes de usarlo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: WfCreatedResponse, description: 'Trámite' })
  @ApiWfWriteErrors()
  async startTest(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: StartTestInstanceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<WfCreatedResponse> {
    return { id: await this.definitions.startTest(principal, id, body, meta) };
  }
}
