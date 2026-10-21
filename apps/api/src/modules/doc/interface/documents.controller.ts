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
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createDocumentLinkRequestSchema,
  createDocumentRequestSchema,
  createVersionRequestSchema,
  documentLinkListResponseSchema,
  documentListQuerySchema,
  documentListResponseSchema,
  documentRetentionSchema,
  documentSchema,
  documentSearchQuerySchema,
  documentSearchResponseSchema,
  setDocumentRetentionRuleSchema,
  versionListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { DocumentLinksUseCase } from '../application/document-links.js';
import { DocumentSearchUseCase } from '../application/document-search.js';
import { DocumentsUseCase } from '../application/documents.js';
import { RetentionRulesUseCase } from '../application/retention-rules.js';
import { VersionsUseCase } from '../application/versions.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class DocumentListQuery extends createZodDto(documentListQuerySchema) {}
class DocumentListResponse extends createZodDto(documentListResponseSchema) {}
class DocumentResponse extends createZodDto(documentSchema) {}
class CreateDocumentRequest extends createZodDto(createDocumentRequestSchema) {}
class VersionListResponse extends createZodDto(versionListResponseSchema) {}
class CreateVersionRequest extends createZodDto(createVersionRequestSchema) {}
class DocumentLinkListResponse extends createZodDto(documentLinkListResponseSchema) {}
class CreateDocumentLinkRequest extends createZodDto(createDocumentLinkRequestSchema) {}
class DocumentSearchQuery extends createZodDto(documentSearchQuerySchema) {}
class DocumentSearchResponse extends createZodDto(documentSearchResponseSchema) {}
class DocumentRetentionResponse extends createZodDto(documentRetentionSchema) {}
class SetDocumentRetentionRule extends createZodDto(setDocumentRetentionRuleSchema) {}

const UUID = new ParseUUIDPipe();

/**
 * Documentos (M03, B18): ficha, versiones y vínculos con otros registros. Desde B21, la búsqueda de
 * texto completo y la regla de retención de cada documento.
 */
@ApiTags('Documentos')
@Controller('v1/documents')
@ApiPermissionErrors()
export class DocumentsController {
  constructor(
    @Inject(DocumentsUseCase) private readonly documents: DocumentsUseCase,
    @Inject(VersionsUseCase) private readonly versions: VersionsUseCase,
    @Inject(DocumentLinksUseCase) private readonly links: DocumentLinksUseCase,
    @Inject(DocumentSearchUseCase) private readonly finder: DocumentSearchUseCase,
    @Inject(RetentionRulesUseCase) private readonly retention: RetentionRulesUseCase,
  ) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Documentos que la persona puede ver',
    description: 'En orden de código, por páginas; filtra por carpeta, estado y texto.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DocumentListResponse, description: 'Documentos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: DocumentListQuery,
  ): Promise<DocumentListResponse> {
    return this.documents.list(principal, ability, query);
  }

  @RequirePermission('doc.document.create')
  @Post()
  @ApiOperation({
    summary: 'Crear un documento con su versión 00 en borrador',
    description:
      'El código lo da el consecutivo: TIPO-PROCESO-NNN en el SGC (PR-SGC-001) o DOC-AAAA-NNNN en un expediente.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creado' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateDocumentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.documents.create(principal, body, meta) };
  }

  @RequirePermission('doc.document.read')
  @Get('search')
  @ApiOperation({
    summary: 'Buscar documentos por su texto',
    description:
      'En español y sin tildes, en el código, el título y el texto de la versión vigente. Solo devuelve documentos que la persona puede abrir; los restringidos, sin fragmento.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DocumentSearchResponse, description: 'Resultados' })
  async search(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: DocumentSearchQuery,
  ): Promise<DocumentSearchResponse> {
    return this.finder.search(principal, ability, query);
  }

  @RequirePermission('doc.document.read')
  @Get(':id/retention-rule')
  @ApiOperation({
    summary: 'Retención de un documento',
    description: 'Su regla (RE-SGC-005), desde cuándo corre el plazo y cuándo vence.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DocumentRetentionResponse, description: 'Retención' })
  @ApiDocErrors()
  async retentionOf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DocumentRetentionResponse> {
    return this.retention.ofDocument(principal, ability, id);
  }

  @RequirePermission('doc.retention.manage')
  @Put(':id/retention-rule')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dar a un documento otra regla de retención',
    description: 'Una excepción a la regla de su tipo y su proceso; null vuelve a esa regla.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async setRetention(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SetDocumentRetentionRule,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.retention.setForDocument({ principal, ability, meta }, target, body);
  }

  @RequirePermission('doc.document.read')
  @Get(':id')
  @ApiOperation({
    summary: 'Ficha de un documento',
    description: 'Consultar un documento restringido queda en el registro de accesos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DocumentResponse, description: 'Documento' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DocumentResponse> {
    return this.documents.get(principal, ability, id, meta);
  }

  @RequirePermission('doc.document.read')
  @Get(':id/versions')
  @ApiOperation({
    summary: 'Versiones de un documento',
    description: 'Quien solo ve lo propio ve únicamente la vigente de los documentos ajenos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: VersionListResponse, description: 'Versiones' })
  @ApiDocErrors()
  async versionList(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<VersionListResponse> {
    return { data: await this.versions.list(principal, ability, id) };
  }

  @RequirePermission('doc.document.update')
  @Post(':id/versions')
  @ApiOperation({
    summary: 'Crear una versión nueva en borrador',
    description: 'Una a la vez: si hay otra en trámite responde 409. La vigente no cambia.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creada' })
  @ApiDocErrors()
  async createVersion(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CreateVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.versions.create(principal, ability, id, body, meta) };
  }

  @RequirePermission('doc.document.read')
  @Get(':id/links')
  @ApiOperation({ summary: 'Vínculos del documento con cargos, procesos y terceros' })
  @ZodResponse({ status: HttpStatus.OK, type: DocumentLinkListResponse, description: 'Vínculos' })
  @ApiDocErrors()
  async linkList(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DocumentLinkListResponse> {
    return { data: await this.links.list(principal, ability, id) };
  }

  @RequirePermission('doc.document.update')
  @Post(':id/links')
  @ApiOperation({ summary: 'Vincular el documento con un cargo, un proceso o un tercero' })
  @ZodResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Vinculado' })
  @ApiDocErrors()
  async createLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CreateDocumentLinkRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.links.create(principal, ability, id, body, meta) };
  }

  @RequirePermission('doc.document.update')
  @Delete(':id/links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar un vínculo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiDocErrors()
  async removeLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) documentId: string,
    @Param('linkId', UUID) linkId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.links.remove(principal, ability, { documentId, linkId }, meta);
  }
}
