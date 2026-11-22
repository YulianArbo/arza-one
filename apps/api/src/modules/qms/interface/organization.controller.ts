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
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contextItemListResponseSchema,
  contextQuerySchema,
  qmsCreatedResponseSchema,
  qmsProcessListResponseSchema,
  saveCharacterizationSchema,
  saveContextItemSchema,
  saveStakeholderSchema,
  stakeholderListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { OrganizationContext } from '../application/context.js';
import { Processes } from '../application/processes.js';

class QmsProcessListResponse extends createZodDto(qmsProcessListResponseSchema) {}
class QmsCharacterizationBody extends createZodDto(saveCharacterizationSchema) {}
class QmsContextListResponse extends createZodDto(contextItemListResponseSchema) {}
class QmsContextQuery extends createZodDto(contextQuerySchema) {}
class QmsContextBody extends createZodDto(saveContextItemSchema) {}
class QmsStakeholderListResponse extends createZodDto(stakeholderListResponseSchema) {}
class QmsStakeholderBody extends createZodDto(saveStakeholderSchema) {}
class QmsCreatedResponse extends createZodDto(qmsCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Mapa de procesos, contexto DOFA-PESTEL y partes interesadas (B38, ficha 17.15).

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class OrganizationController {
  constructor(
    @Inject(Processes) private readonly processes: Processes,
    @Inject(OrganizationContext) private readonly context: OrganizationContext,
  ) {}

  @Get('processes')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar el mapa de procesos con sus caracterizaciones' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsProcessListResponse, description: 'Mapa' })
  async listProcesses(@CurrentPrincipal() principal: Principal): Promise<QmsProcessListResponse> {
    return { data: await this.processes.list(principal) };
  }

  @Post('processes/:id/characterization')
  @RequirePermission('qms.process.manage')
  @ApiOperation({ summary: 'Registrar el tipo y la caracterización de un proceso' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCreatedResponse, description: 'Registrada' })
  async characterize(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: QmsCharacterizationBody,
  ): Promise<QmsCreatedResponse> {
    return { id: await this.processes.characterize(principal, meta, id, input) };
  }

  @Patch('characterizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.process.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar la caracterización de un proceso' })
  async updateCharacterization(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsCharacterizationBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.processes.update(principal, meta, target, input);
  }

  @Get('context')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar la matriz DOFA-PESTEL, por año' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsContextListResponse, description: 'Matriz' })
  async listContext(
    @CurrentPrincipal() principal: Principal,
    @Query() query: QmsContextQuery,
  ): Promise<QmsContextListResponse> {
    return { data: await this.context.listContext(principal, query.year) };
  }

  @Post('context')
  @RequirePermission('qms.process.manage')
  @ApiOperation({ summary: 'Agregar un factor de contexto' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCreatedResponse, description: 'Agregado' })
  async createContext(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsContextBody,
  ): Promise<QmsCreatedResponse> {
    return { id: await this.context.createContext(principal, meta, input) };
  }

  @Patch('context/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.process.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un factor de contexto' })
  async updateContext(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsContextBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.context.updateContext(principal, meta, target, input);
  }

  @Get('stakeholders')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar la matriz de partes interesadas' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsStakeholderListResponse, description: 'Matriz' })
  async listStakeholders(
    @CurrentPrincipal() principal: Principal,
  ): Promise<QmsStakeholderListResponse> {
    return { data: await this.context.listStakeholders(principal) };
  }

  @Post('stakeholders')
  @RequirePermission('qms.process.manage')
  @ApiOperation({ summary: 'Agregar una parte interesada' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsCreatedResponse, description: 'Agregada' })
  async createStakeholder(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsStakeholderBody,
  ): Promise<QmsCreatedResponse> {
    return { id: await this.context.createStakeholder(principal, meta, input) };
  }

  @Patch('stakeholders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.process.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar una parte interesada' })
  async updateStakeholder(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsStakeholderBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.context.updateStakeholder(principal, meta, target, input);
  }
}
