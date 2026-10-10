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
  catalogDetailResponseSchema,
  catalogItemSchema,
  catalogListResponseSchema,
  costCenterListResponseSchema,
  costCenterSchema,
  createCatalogItemRequestSchema,
  createCostCenterRequestSchema,
  updateCatalogItemRequestSchema,
  updateCostCenterRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CatalogsUseCase } from '../application/catalogs.js';
import { CostCentersUseCase } from '../application/cost-centers.js';
import { ApiCoreWriteErrors, ApiIfMatch, CoreCreatedResponse } from './core-openapi.js';

class CostCenterListResponse extends createZodDto(costCenterListResponseSchema) {}
class CostCenterResponse extends createZodDto(costCenterSchema) {}
class CreateCostCenterRequest extends createZodDto(createCostCenterRequestSchema) {}
class UpdateCostCenterRequest extends createZodDto(updateCostCenterRequestSchema) {}
class CatalogListResponse extends createZodDto(catalogListResponseSchema) {}
class CatalogDetailResponse extends createZodDto(catalogDetailResponseSchema) {}
class CatalogItemResponse extends createZodDto(catalogItemSchema) {}
class CreateCatalogItemRequest extends createZodDto(createCatalogItemRequestSchema) {}
class UpdateCatalogItemRequest extends createZodDto(updateCatalogItemRequestSchema) {}

/** Centros de costo y catálogos administrables (M00, B12). */
@ApiTags('Empresa y organización')
@Controller('v1')
@ApiPermissionErrors()
export class ListsController {
  constructor(
    @Inject(CostCentersUseCase) private readonly costCenters: CostCentersUseCase,
    @Inject(CatalogsUseCase) private readonly catalogs: CatalogsUseCase,
  ) {}

  @RequirePermission('core.org.read')
  @Get('cost-centers')
  @ApiOperation({ summary: 'Centros de costo' })
  @ZodResponse({ status: HttpStatus.OK, type: CostCenterListResponse, description: 'Centros' })
  async listCostCenters(@CurrentPrincipal() principal: Principal): Promise<CostCenterListResponse> {
    return { data: await this.costCenters.list(principal) };
  }

  @RequirePermission('core.org.manage')
  @Post('cost-centers')
  @ApiOperation({ summary: 'Crear un centro de costo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async createCostCenter(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateCostCenterRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.costCenters.create(principal, body, meta) };
  }

  @RequirePermission('core.org.manage')
  @Patch('cost-centers/:id')
  @ApiOperation({ summary: 'Editar o inactivar un centro de costo' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: CostCenterResponse, description: 'Centro' })
  @ApiCoreWriteErrors()
  async updateCostCenter(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateCostCenterRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CostCenterResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.costCenters.update(principal, target, body, meta);
  }

  @RequirePermission('core.org.manage')
  @Delete('cost-centers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un centro de costo' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Eliminado' })
  @ApiCoreWriteErrors()
  async deleteCostCenter(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.costCenters.remove(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('core.parameter.read')
  @Get('catalogs')
  @ApiOperation({ summary: 'Catálogos administrables' })
  @ZodResponse({ status: HttpStatus.OK, type: CatalogListResponse, description: 'Catálogos' })
  async listCatalogs(@CurrentPrincipal() principal: Principal): Promise<CatalogListResponse> {
    return { data: await this.catalogs.list(principal) };
  }

  @RequirePermission('core.parameter.read')
  @Get('catalogs/:key')
  @ApiOperation({ summary: 'Un catálogo con sus opciones, activas e inactivas' })
  @ZodResponse({ status: HttpStatus.OK, type: CatalogDetailResponse, description: 'Catálogo' })
  @ApiCoreWriteErrors()
  async catalog(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
  ): Promise<CatalogDetailResponse> {
    return this.catalogs.detail(principal, key);
  }

  @RequirePermission('core.catalog.manage')
  @Post('catalogs/:key/items')
  @ApiOperation({ summary: 'Agregar una opción a un catálogo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creada' })
  @ApiCoreWriteErrors()
  async addItem(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
    @Body() body: CreateCatalogItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.catalogs.addItem(principal, key, body, meta) };
  }

  @RequirePermission('core.catalog.manage')
  @Patch('catalogs/:key/items/:id')
  @ApiOperation({ summary: 'Editar, reordenar o inactivar una opción' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: CatalogItemResponse, description: 'Opción' })
  @ApiCoreWriteErrors()
  async updateItem(
    @CurrentPrincipal() principal: Principal,
    @Param('key') key: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateCatalogItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CatalogItemResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.catalogs.updateItem(principal, key, target, body, meta);
  }
}
