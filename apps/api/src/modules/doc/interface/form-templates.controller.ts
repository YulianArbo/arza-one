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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createFormTemplateSchema,
  formPreviewResponseSchema,
  formTemplateListQuerySchema,
  formTemplateListResponseSchema,
  formTemplateSchema,
  updateFormTemplateSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { FormTemplatesUseCase } from '../application/form-templates.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class FormTemplateListQuery extends createZodDto(formTemplateListQuerySchema) {}
class FormTemplateListResponse extends createZodDto(formTemplateListResponseSchema) {}
class FormTemplateResponse extends createZodDto(formTemplateSchema) {}
class CreateFormTemplate extends createZodDto(createFormTemplateSchema) {}
class UpdateFormTemplate extends createZodDto(updateFormTemplateSchema) {}
class FormPreviewResponse extends createZodDto(formPreviewResponseSchema) {}

const UUID = new ParseUUIDPipe();
const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

/**
 * Formatos digitales (M03, B20; ficha 17.4 y capítulo 18, forma B): el diseñador con su esquema
 * versionado. Cada publicación es una versión nueva e inmutable.
 */
@ApiTags('Documentos')
@Controller('v1/form-templates')
@ApiPermissionErrors()
export class FormTemplatesController {
  constructor(@Inject(FormTemplatesUseCase) private readonly templates: FormTemplatesUseCase) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Listar los formatos digitales',
    description: 'Todas sus versiones; con «fillable», solo la publicada que se puede diligenciar.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FormTemplateListResponse, description: 'Formatos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: FormTemplateListQuery,
  ): Promise<FormTemplateListResponse> {
    return this.templates.list(principal, query);
  }

  @RequirePermission('doc.form_template.manage')
  @Post()
  @ApiOperation({
    summary: 'Crear un formato o una versión nueva en borrador',
    description:
      'Con un código que ya existe, crea la versión siguiente. Solo hay un borrador por código.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creado' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateFormTemplate,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.templates.create(principal, body, meta) };
  }

  @RequirePermission('doc.document.read')
  @Get(':id')
  @ApiOperation({
    summary: 'Ver una versión de un formato',
    description: 'Con sus secciones y campos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FormTemplateResponse, description: 'Formato' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<FormTemplateResponse> {
    return this.templates.get(principal, ability, id);
  }

  @RequirePermission('doc.form_template.manage')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar el borrador',
    description: 'Publicado, no cambia: responde 409.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFormTemplate,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.templates.update(
      principal,
      { id, version: versionFromIfMatch(ifMatch) },
      body,
      meta,
    );
  }

  @RequirePermission('doc.form_template.manage')
  @Post(':id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Publicar el borrador',
    description:
      'Queda en uso; la versión publicada anterior pasa a retirada y sus registros la conservan.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.templates.publish(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('doc.form_template.manage')
  @Post(':id/actions/retire')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retirar el formato',
    description: 'Deja de diligenciarse; sus registros se conservan.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async retire(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.templates.retire(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('doc.form_template.manage')
  @Get(':id/preview')
  @ApiOperation({
    summary: 'Vista previa del formato',
    description:
      'La página con el encabezado y el pie institucionales, vacía o con valores de ejemplo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FormPreviewResponse, description: 'Vista previa' })
  @ApiDocErrors()
  async preview(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<FormPreviewResponse> {
    return this.templates.preview(principal, id);
  }
}
