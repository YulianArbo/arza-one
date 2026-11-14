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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  kbArticleDetailSchema,
  kbArticleListQuerySchema,
  kbArticleListResponseSchema,
  kbArticleRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { KnowledgeUseCase } from '../application/knowledge.js';
import {
  ApiServiceIfMatch,
  ApiServiceWriteErrors,
  ServiceCreatedResponse,
  UUID,
} from './service-openapi.js';

class KbListQuery extends createZodDto(kbArticleListQuerySchema) {}
class KbListResponse extends createZodDto(kbArticleListResponseSchema) {}
class KbDetailResponse extends createZodDto(kbArticleDetailSchema) {}
class KbArticleRequest extends createZodDto(kbArticleRequestSchema) {}

/** Base de conocimiento (M08, B29; ficha 17.9). */
@ApiTags('Servicio')
@Controller('v1/kb-articles')
@ApiPermissionErrors()
export class KnowledgeController {
  constructor(@Inject(KnowledgeUseCase) private readonly knowledge: KnowledgeUseCase) {}

  @RequirePermission('service.kb.read')
  @Get()
  @ApiOperation({
    summary: 'Artículos',
    description: 'Los publicados; quien administra ve también borradores y archivados.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: KbListResponse, description: 'Artículos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: KbListQuery,
  ): Promise<KbListResponse> {
    return this.knowledge.list(principal, ability, query);
  }

  @RequirePermission('service.kb.manage')
  @Post()
  @ApiOperation({ summary: 'Escribir un artículo', description: 'Nace como borrador.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ServiceCreatedResponse, description: 'Creado' })
  @ApiServiceWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: KbArticleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ServiceCreatedResponse> {
    return { id: await this.knowledge.create(principal, body, meta) };
  }

  @RequirePermission('service.kb.read')
  @Get(':id')
  @ApiOperation({ summary: 'Leer un artículo' })
  @ZodResponse({ status: HttpStatus.OK, type: KbDetailResponse, description: 'Artículo' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<KbDetailResponse> {
    return this.knowledge.detail(principal, ability, id);
  }

  @RequirePermission('service.kb.manage')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar un artículo', description: 'Borrador o publicado.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiServiceWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: KbArticleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.knowledge.update(principal, target, body, meta);
  }

  @RequirePermission('service.kb.manage')
  @Post(':id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publicar', description: 'Desde borrador o archivado.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Publicado' })
  @ApiServiceWriteErrors()
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.knowledge.publish(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('service.kb.manage')
  @Post(':id/actions/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archivar', description: 'Deja de verse; se puede volver a publicar.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Archivado' })
  @ApiServiceWriteErrors()
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.knowledge.archive(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }
}
