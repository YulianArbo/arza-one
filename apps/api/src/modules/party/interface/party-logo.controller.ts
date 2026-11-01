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
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  errorResponseSchema,
  imageUploadRequestSchema,
  setImageRequestSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { imageResponse } from '../../../platform/http/image-response.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PartyLogoUseCase } from '../application/party-logo.js';

class ImageUploadRequest extends createZodDto(imageUploadRequestSchema) {}
class SetImageRequest extends createZodDto(setImageRequestSchema) {}
class UploadLinkResponse extends createZodDto(uploadLinkResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe();
const NOT_ALLOWED = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: ErrorResponse.Output,
  description: 'El tercero es una persona, o la imagen no es propia, PNG o JPG revisada',
};

/** Logo de una empresa en Terceros (B22A). */
@ApiTags('Terceros')
@Controller('v1/parties/:id/logo')
@ApiPermissionErrors()
export class PartyLogoController {
  constructor(@Inject(PartyLogoUseCase) private readonly logos: PartyLogoUseCase) {}

  @RequirePermission('party.update')
  @Post('uploads')
  @ApiOperation({
    summary: 'Pedir el enlace para subir el logo',
    description: 'PNG o JPG de hasta 2 MB.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: UploadLinkResponse, description: 'Enlace' })
  @ApiResponse(NOT_ALLOWED)
  async requestUpload(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: ImageUploadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.logos.requestUpload(principal, id, body, meta);
  }

  @RequirePermission('party.update')
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usar una imagen ya revisada como logo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Logo cambiado' })
  @ApiResponse(NOT_ALLOWED)
  async set(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: SetImageRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.logos.set(principal, id, body.file_id, meta);
  }

  @RequirePermission('party.update')
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar el logo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Logo quitado' })
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.logos.remove(principal, id, meta);
  }

  @RequirePermission('party.read')
  @Get()
  @ApiOperation({ summary: 'Logo del tercero' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'Sin logo',
  })
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.logos.open(principal, ability, id));
  }
}
