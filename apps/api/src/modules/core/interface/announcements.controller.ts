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
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  announcementListResponseSchema,
  announcementRequestSchema,
  announcementSchema,
  errorResponseSchema,
  imageUploadRequestSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { imageResponse } from '../../../platform/http/image-response.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AnnouncementsUseCase } from '../application/announcements.js';
import { ApiCoreWriteErrors, ApiIfMatch, CoreCreatedResponse } from './core-openapi.js';

class AnnouncementListResponse extends createZodDto(announcementListResponseSchema) {}
class AnnouncementResponse extends createZodDto(announcementSchema) {}
class AnnouncementRequest extends createZodDto(announcementRequestSchema) {}
class AnnouncementImageUploadRequest extends createZodDto(imageUploadRequestSchema) {}
class AnnouncementUploadLinkResponse extends createZodDto(uploadLinkResponseSchema) {}
class AnnouncementErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** Comunicados del acceso (B36A): Administración › Comunicados. */
@ApiTags('Comunicados')
@Controller('v1/announcements')
@RequirePermission('core.announcement.manage')
@ApiPermissionErrors()
export class AnnouncementsController {
  constructor(@Inject(AnnouncementsUseCase) private readonly announcements: AnnouncementsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Comunicados, los más recientes primero, con su estado' })
  @ZodResponse({ status: HttpStatus.OK, type: AnnouncementListResponse, description: 'Lista' })
  async list(@CurrentPrincipal() principal: Principal): Promise<AnnouncementListResponse> {
    return { data: await this.announcements.list(principal) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un comunicado',
    description: 'Se ve en el acceso del primer al último día, en hora de Colombia.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: CoreCreatedResponse, description: 'Creado' })
  @ApiCoreWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AnnouncementRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CoreCreatedResponse> {
    return { id: await this.announcements.create(principal, body, meta) };
  }

  @Post('uploads')
  @ApiOperation({
    summary: 'Pedir el enlace para subir la imagen',
    description: 'PNG o JPG de hasta 2 MB.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: AnnouncementUploadLinkResponse,
    description: 'Enlace',
  })
  async requestUpload(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AnnouncementImageUploadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AnnouncementUploadLinkResponse> {
    return this.announcements.requestUpload(principal, body, meta);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un comunicado que no esté terminado' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: AnnouncementResponse, description: 'Comunicado' })
  @ApiCoreWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AnnouncementRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AnnouncementResponse> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    return this.announcements.update(principal, target, body, meta);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Terminar un comunicado antes de su fecha de fin' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Terminado' })
  @ApiCoreWriteErrors()
  async end(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.announcements.end(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Imagen del comunicado' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: AnnouncementErrorResponse.Output,
    description: 'Sin imagen',
  })
  async image(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.announcements.image(principal, id));
  }
}
