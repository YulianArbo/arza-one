import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createUploadRequestSchema,
  downloadLinkResponseSchema,
  errorResponseSchema,
  fileListResponseSchema,
  fileSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { FilesUseCase } from '../application/files.js';

class CreateUploadRequest extends createZodDto(createUploadRequestSchema) {}
class UploadLinkResponse extends createZodDto(uploadLinkResponseSchema) {}
class FileResponse extends createZodDto(fileSchema) {}
class FileListResponse extends createZodDto(fileListResponseSchema) {}
class DownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** Archivos con sesión: pedir la subida, ver el estado y pedir el enlace de descarga (B14). */
@ApiTags('Archivos')
@Controller('v1/files')
@ApiPermissionErrors()
export class FilesController {
  constructor(@Inject(FilesUseCase) private readonly files: FilesUseCase) {}

  @RequirePermission('doc.document.create')
  @Post()
  @ApiOperation({
    summary: 'Pedir un enlace de subida',
    description:
      'Revisa el tipo (lista blanca) y el tamaño (hasta 20 MB) y devuelve un enlace de un solo uso, válido 15 minutos.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: UploadLinkResponse, description: 'Enlace' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Tipo no permitido, extensión que no corresponde o tamaño fuera del límite',
  })
  async requestUpload(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateUploadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.files.requestUpload(principal, body, meta);
  }

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({ summary: 'Archivos que la persona puede ver, los más recientes primero' })
  @ZodResponse({ status: HttpStatus.OK, type: FileListResponse, description: 'Archivos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<FileListResponse> {
    return { data: await this.files.list(principal, ability) };
  }

  @RequirePermission('doc.document.read')
  @Get(':id')
  @ApiOperation({ summary: 'Un archivo con su estado de análisis y su huella' })
  @ZodResponse({ status: HttpStatus.OK, type: FileResponse, description: 'Archivo' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'El archivo no existe o la persona no lo puede ver',
  })
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<FileResponse> {
    return this.files.get(principal, ability, id);
  }

  @RequirePermission('doc.document.read')
  @Post(':id/download-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pedir un enlace de descarga',
    description: 'Solo de un archivo disponible. El enlace vence a los cinco minutos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadLinkResponse, description: 'Enlace' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'El archivo no existe o la persona no lo puede ver',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'El archivo está en análisis o fue rechazado',
  })
  async downloadLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.files.issueDownloadLink(principal, ability, id, meta);
  }
}
