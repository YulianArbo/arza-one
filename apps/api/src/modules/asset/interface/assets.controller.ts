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
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  assetDetailResponseSchema,
  assetListQuerySchema,
  assetListResponseSchema,
  retireAssetSchema,
  saveAssetSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { astActorOf } from '../application/asset-support.js';
import { AssetsUseCase, type AssetViewer } from '../application/assets.js';
import { AstCreatedResponse, CONFLICT, IF_MATCH, INVALID, NOT_FOUND, UUID } from './asset-http.js';

class AssetListResponse extends createZodDto(assetListResponseSchema) {}
class AssetListQuery extends createZodDto(assetListQuerySchema) {}
class AssetDetailResponse extends createZodDto(assetDetailResponseSchema) {}
class SaveAsset extends createZodDto(saveAssetSchema) {}
class RetireAsset extends createZodDto(retireAssetSchema) {}

/** Todo el inventario, o solo lo propio si el permiso de la persona es «solo lo propio». */
export function viewerOf(principal: Principal, ability: AppAbility): AssetViewer {
  return { principal, seesAll: hasUnconditionalPermission(ability, 'asset.read') };
}

/** Inventario de activos fijos y licencias, bajas y libro de activos. */
@ApiTags('Activos')
@Controller('v1/assets')
@ApiPermissionErrors()
export class AssetsController {
  constructor(
    @Inject(AssetsUseCase) private readonly assets: AssetsUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @RequirePermission('asset.read')
  @Get()
  @ApiOperation({
    summary: 'Activos de la empresa; con «solo lo propio», los que la persona tiene a su cargo',
  })
  @ZodResponse({ status: HttpStatus.OK, type: AssetListResponse, description: 'Activos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: AssetListQuery,
  ): Promise<AssetListResponse> {
    return { data: await this.assets.list(viewerOf(principal, ability), query) };
  }

  @RequirePermission('asset.read')
  @Post('book/export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Descargar el libro de activos (CSV); exige ver todo el inventario' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async book(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    if (!viewerOf(principal, ability).seesAll) throw permissionDenied();
    const file = await this.assets.book(astActorOf(principal, meta, this.clock.now()));
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }

  @RequirePermission('asset.read')
  @Get(':id')
  @ApiOperation({ summary: 'Un activo con su historia de asignaciones y sus mantenimientos' })
  @ZodResponse({ status: HttpStatus.OK, type: AssetDetailResponse, description: 'Activo' })
  @ApiResponse(NOT_FOUND)
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<AssetDetailResponse> {
    return this.assets.detail(viewerOf(principal, ability), id);
  }

  @RequirePermission('asset.manage')
  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar un activo en el inventario' })
  @ZodResponse({ status: HttpStatus.CREATED, type: AstCreatedResponse, description: 'Activo' })
  @ApiResponse(INVALID)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: SaveAsset,
    @Meta() meta: RequestMeta,
  ): Promise<AstCreatedResponse> {
    const actor = astActorOf(principal, meta, this.clock.now());
    return { id: await this.assets.create(actor, idempotencyKeyFrom(header), body) };
  }

  @RequirePermission('asset.manage')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar los datos de un activo que no está dado de baja' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SaveAsset,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const actor = astActorOf(principal, meta, this.clock.now());
    await this.assets.update(actor, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('asset.retire')
  @Post(':id/retirement')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Dar de baja un activo disponible, con su motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Dado de baja' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RetireAsset,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const actor = astActorOf(principal, meta, this.clock.now());
    await this.assets.retire(actor, id, versionFromIfMatch(ifMatch), body);
  }
}
