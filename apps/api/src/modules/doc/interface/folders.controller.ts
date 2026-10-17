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
  createFolderRequestSchema,
  folderListResponseSchema,
  updateFolderRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { FoldersUseCase } from '../application/folders.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class FolderListResponse extends createZodDto(folderListResponseSchema) {}
class CreateFolderRequest extends createZodDto(createFolderRequestSchema) {}
class UpdateFolderRequest extends createZodDto(updateFolderRequestSchema) {}

/** Explorador de expedientes (M03, B18): carpetas y expedientes de terceros. */
@ApiTags('Documentos')
@Controller('v1/folders')
@ApiPermissionErrors()
export class FoldersController {
  constructor(@Inject(FoldersUseCase) private readonly folders: FoldersUseCase) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Carpetas y expedientes',
    description: 'Todo el árbol, con los documentos que la persona puede ver en cada carpeta.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FolderListResponse, description: 'Carpetas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<FolderListResponse> {
    return { data: await this.folders.list(principal, ability) };
  }

  @RequirePermission('doc.document.create')
  @Post()
  @ApiOperation({
    summary: 'Crear una carpeta o el expediente de un tercero',
    description: 'Cada tercero tiene a lo más un expediente; un expediente no va dentro de otro.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creada' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateFolderRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.folders.create(principal, body, meta) };
  }

  @RequirePermission('doc.document.update')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Renombrar una carpeta',
    description: 'Cambia el nombre y la clasificación sugerida; la carpeta no cambia de lugar.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Renombrada' })
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFolderRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.folders.update(principal, id, versionFromIfMatch(ifMatch), body, meta);
  }
}
