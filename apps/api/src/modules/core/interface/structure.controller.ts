import {
  Body,
  Controller,
  Delete,
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
  createOrgUnitRequestSchema,
  createPositionRequestSchema,
  orgUnitListResponseSchema,
  orgUnitSchema,
  positionListResponseSchema,
  positionSchema,
  updateOrgUnitRequestSchema,
  updatePositionRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { OrgUnitsUseCase } from '../application/org-units.js';
import { PositionsUseCase } from '../application/positions.js';
import { ApiCoreWriteErrors, ApiIfMatch, CoreCreatedResponse } from './core-openapi.js';

class OrgUnitListResponse extends createZodDto(orgUnitListResponseSchema) {}
class OrgUnitResponse extends createZodDto(orgUnitSchema) {}
class CreateOrgUnitRequest extends createZodDto(createOrgUnitRequestSchema) {}
class UpdateOrgUnitRequest extends createZodDto(updateOrgUnitRequestSchema) {}
class PositionListResponse extends createZodDto(positionListResponseSchema) {}
class PositionResponse extends createZodDto(positionSchema) {}
class CreatePositionRequest extends createZodDto(createPositionRequestSchema) {}
class UpdatePositionRequest extends createZodDto(updatePositionRequestSchema) {}

/**
 * Procesos, áreas y cargos con su jerarquía (M00, B12): el organigrama DC-SGC-001. Uno con
 * registros asociados no se elimina: se inactiva.
 */
@ApiTags('Empresa y organización')
@Controller('v1')
@ApiPermissionErrors()
export class StructureController {
  constructor(
    @Inject(OrgUnitsUseCase) private readonly units: OrgUnitsUseCase,
    @Inject(PositionsUseCase) private readonly positions: PositionsUseCase,
  ) {}

  @RequirePermission('core.org.read')
  @Get('org-units')
  @ApiOperation({ summary: 'Procesos y áreas, con la unidad de la que dependen' })
  @ZodResponse({ status: HttpStatus.OK, type: OrgUnitListResponse, description: 'Procesos' })
  async listUnits(@CurrentPrincipal() principal: Principal): Promise<OrgUnitListResponse> {
    return { data: await this.units.list(principal) };
  }

  @RequirePermission('core.org.manage')
  @Post('org-units')
  @ApiOperation({ summary: 'Crear un proceso o área' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async createUnit(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateOrgUnitRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.units.create(principal, body, meta) };
  }

  @RequirePermission('core.org.manage')
  @Patch('org-units/:id')
  @ApiOperation({ summary: 'Editar o inactivar un proceso o área' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: OrgUnitResponse, description: 'Proceso' })
  @ApiCoreWriteErrors()
  async updateUnit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateOrgUnitRequest,
    @Meta() meta: RequestMeta,
  ): Promise<OrgUnitResponse> {
    return this.units.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('core.org.manage')
  @Delete('org-units/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un proceso o área sin registros asociados' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Eliminado' })
  @ApiCoreWriteErrors()
  async deleteUnit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.units.remove(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('core.org.read')
  @Get('positions')
  @ApiOperation({ summary: 'Cargos del organigrama y a quién reporta cada uno' })
  @ZodResponse({ status: HttpStatus.OK, type: PositionListResponse, description: 'Cargos' })
  async listPositions(@CurrentPrincipal() principal: Principal): Promise<PositionListResponse> {
    return { data: await this.positions.list(principal) };
  }

  @RequirePermission('core.org.manage')
  @Post('positions')
  @ApiOperation({ summary: 'Crear un cargo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async createPosition(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreatePositionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.positions.create(principal, body, meta) };
  }

  @RequirePermission('core.org.manage')
  @Patch('positions/:id')
  @ApiOperation({ summary: 'Editar o inactivar un cargo' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: PositionResponse, description: 'Cargo' })
  @ApiCoreWriteErrors()
  async updatePosition(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePositionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PositionResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.positions.update(principal, target, body, meta);
  }

  @RequirePermission('core.org.manage')
  @Delete('positions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un cargo sin personas, subordinados ni procesos a cargo' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Eliminado' })
  @ApiCoreWriteErrors()
  async deletePosition(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.positions.remove(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }
}
