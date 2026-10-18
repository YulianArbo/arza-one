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
  createOutputTemplateSchema,
  formPreviewResponseSchema,
  outputTemplateListQuerySchema,
  outputTemplateListResponseSchema,
  outputTemplateSchema,
  updateOutputTemplateSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { OutputTemplatesUseCase } from '../application/output-templates.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class OutputTemplateListQuery extends createZodDto(outputTemplateListQuerySchema) {}
class OutputTemplateListResponse extends createZodDto(outputTemplateListResponseSchema) {}
class OutputTemplateResponse extends createZodDto(outputTemplateSchema) {}
class CreateOutputTemplate extends createZodDto(createOutputTemplateSchema) {}
class UpdateOutputTemplate extends createZodDto(updateOutputTemplateSchema) {}
class OutputPreviewResponse extends createZodDto(formPreviewResponseSchema) {}

const UUID = new ParseUUIDPipe();
const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

/**
 * Plantillas de salida (M03, B20; numeral 13.2): HTML con variables {{nombre}} o Word con
 * variables {nombre}, que se llenan con los datos del registro y se convierten a PDF.
 */
@ApiTags('Documentos')
@Controller('v1/output-templates')
@ApiPermissionErrors()
export class OutputTemplatesController {
  constructor(@Inject(OutputTemplatesUseCase) private readonly templates: OutputTemplatesUseCase) {}

  @RequirePermission('doc.form_template.manage')
  @Get()
  @ApiOperation({ summary: 'Listar las plantillas de salida', description: 'Todas sus versiones.' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: OutputTemplateListResponse,
    description: 'Plantillas',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: OutputTemplateListQuery,
  ): Promise<OutputTemplateListResponse> {
    return this.templates.list(principal, query);
  }

  @RequirePermission('doc.form_template.manage')
  @Post()
  @ApiOperation({
    summary: 'Crear una plantilla o una versión nueva en borrador',
    description: 'Revisa la sintaxis y anota las variables. El Word se sube antes con /v1/files.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creada' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateOutputTemplate,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.templates.create(principal, body, meta) };
  }

  @RequirePermission('doc.form_template.manage')
  @Get(':id')
  @ApiOperation({
    summary: 'Ver una plantilla de salida',
    description: 'Con su contenido y variables.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: OutputTemplateResponse, description: 'Plantilla' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<OutputTemplateResponse> {
    return this.templates.get(principal, id);
  }

  @RequirePermission('doc.form_template.manage')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar el borrador',
    description: 'Publicada, no cambia: responde 409.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateOutputTemplate,
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
    description: 'La versión publicada anterior pasa a retirada.',
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
  @Get(':id/preview')
  @ApiOperation({
    summary: 'Vista previa de la plantilla',
    description: 'Llena con valores de ejemplo y con el encabezado y el pie institucionales.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: OutputPreviewResponse, description: 'Vista previa' })
  @ApiDocErrors()
  async preview(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<OutputPreviewResponse> {
    return this.templates.preview(principal, id);
  }
}
