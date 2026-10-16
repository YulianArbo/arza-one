import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  attachmentListSchema,
  createAttachmentRequestSchema,
  downloadLinkResponseSchema,
  recordRefSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequireRecordAccess } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AttachmentsUseCase } from '../application/attachments.js';
import { ApiNtfWriteErrors, NtfCreatedResponse } from './ntf-openapi.js';

class RecordQuery extends createZodDto(recordRefSchema) {}
class AttachmentListResponse extends createZodDto(attachmentListSchema) {}
class CreateAttachmentRequest extends createZodDto(createAttachmentRequestSchema) {}
class AttachmentLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const UUID = new ParseUUIDPipe();

/**
 * Adjuntos de cualquier registro (B16, ficha 17.5): archivos ya subidos y revisados por el
 * antivirus (B14). El permiso lo define el módulo dueño del registro.
 */
@ApiTags('Comentarios y adjuntos')
@Controller('v1/attachments')
@RequireRecordAccess()
@ApiPermissionErrors()
export class AttachmentsController {
  constructor(@Inject(AttachmentsUseCase) private readonly attachments: AttachmentsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Adjuntos de un registro' })
  @ZodResponse({ status: HttpStatus.OK, type: AttachmentListResponse, description: 'Adjuntos' })
  @ApiNtfWriteErrors()
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: RecordQuery,
  ): Promise<AttachmentListResponse> {
    return this.attachments.list(principal, ability, query);
  }

  @Post()
  @ApiOperation({ summary: 'Adjuntar a un registro un archivo que usted subió' })
  @ZodResponse({ status: HttpStatus.CREATED, type: NtfCreatedResponse, description: 'Creado' })
  @ApiNtfWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateAttachmentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<NtfCreatedResponse> {
    return this.attachments.create(principal, ability, body, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar un adjunto propio', description: 'El archivo se conserva.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiNtfWriteErrors()
  async remove(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.attachments.remove(principal, ability, id, meta);
  }

  @Post(':id/download-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enlace de descarga de cinco minutos del archivo adjunto' })
  @ZodResponse({ status: HttpStatus.OK, type: AttachmentLinkResponse, description: 'Enlace' })
  @ApiNtfWriteErrors()
  async downloadLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AttachmentLinkResponse> {
    return this.attachments.downloadLink(principal, ability, id, meta);
  }
}
