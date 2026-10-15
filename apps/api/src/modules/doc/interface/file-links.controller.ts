import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errorResponseSchema } from '@arza/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { FilesUseCase } from '../application/files.js';

class ErrorResponse extends createZodDto(errorResponseSchema) {}

const LINK_NOT_VALID = {
  status: HttpStatus.NOT_FOUND,
  type: ErrorResponse.Output,
  description: 'El enlace no existe, ya se usó o venció',
};

/**
 * Enlaces temporales (numeral 13.2, ADR-013): la llave del enlace es la autorización, emitida
 * después de verificar el permiso. Garage nunca queda expuesto: el contenido pasa por la API.
 */
@ApiTags('Archivos')
@Controller('v1/files')
@Public()
@ApiCommonErrors()
export class FileLinksController {
  constructor(@Inject(FilesUseCase) private readonly files: FilesUseCase) {}

  @Put('uploads/:token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Subir el archivo por su enlace',
    description:
      'El cuerpo es el archivo, con el tipo (Content-Type) y el tamaño declarados. El worker lo analiza después.',
  })
  @ApiConsumes('application/octet-stream')
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Recibido; queda en análisis' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse({
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    type: ErrorResponse.Output,
    description: 'El tipo enviado no es el declarado',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'El tamaño enviado no es el declarado',
  })
  async upload(
    @Param('token') token: string,
    @Req() request: Request,
    @Headers('content-type') contentType: string | undefined,
    @Headers('content-length') contentLength: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.files.receiveUpload(token, { body: request, contentType, contentLength }, meta);
  }

  @Get('downloads/:token')
  @ApiOperation({
    summary: 'Descargar el archivo por su enlace',
    description: 'Siempre como adjunto. El enlace vence a los cinco minutos de emitido.',
  })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: HttpStatus.OK, description: 'El archivo' })
  @ApiResponse(LINK_NOT_VALID)
  async download(
    @Param('token') token: string,
    @Res({ passthrough: true }) response: Response,
    @Meta() meta: RequestMeta,
  ): Promise<StreamableFile> {
    const file = await this.files.download(token, meta);
    // Como adjunto (numeral 15.4): el navegador no lo abre ni lo ejecuta dentro de la página.
    response.attachment(file.fileName);
    return new StreamableFile(file.content, { type: file.mimeType, length: file.sizeBytes });
  }
}
