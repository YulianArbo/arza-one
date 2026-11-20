import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  errorResponseSchema,
  publicAnnouncementListResponseSchema,
  publicAnnouncementQuerySchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { imageResponse } from '../../../platform/http/image-response.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { PublicAnnouncementsUseCase } from '../application/public-announcements.js';

class PublicAnnouncementListResponse extends createZodDto(publicAnnouncementListResponseSchema) {}
class PublicAnnouncementQuery extends createZodDto(publicAnnouncementQuerySchema) {}
class PublicAnnouncementErrorResponse extends createZodDto(errorResponseSchema) {}

/** Cada visita al acceso pide la lista y unas pocas imágenes: el tope deja margen sin abusos. */
const READ_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

/**
 * Comunicados en la pantalla de acceso (B36A), sin sesión: los vigentes hoy de la empresa del
 * sitio, para la pestaña elegida. Son públicos: nunca llevan información confidencial.
 */
@ApiTags('Sitio público')
@Controller('v1/public/announcements')
@Public()
@Throttle(READ_THROTTLE)
@ApiCommonErrors()
export class PublicAnnouncementsController {
  constructor(
    @Inject(PublicAnnouncementsUseCase) private readonly announcements: PublicAnnouncementsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Comunicados vigentes para el personal o para los clientes' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PublicAnnouncementListResponse,
    description: 'Lista',
  })
  async list(@Query() query: PublicAnnouncementQuery): Promise<PublicAnnouncementListResponse> {
    return { data: await this.announcements.list(query) };
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'Imagen de un comunicado vigente' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: PublicAnnouncementErrorResponse.Output,
    description: 'Sin imagen, vencido o terminado',
  })
  async image(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.announcements.image(id));
  }
}
