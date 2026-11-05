import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  errorResponseSchema,
  imageUploadRequestSchema,
  myCompanyResponseSchema,
  setImageRequestSchema,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { OwnAccount } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { imageResponse } from '../../../platform/http/image-response.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { MyCompanyQuery } from '../application/my-company.js';
import { ProfilePhotoUseCase } from '../application/profile-photo.js';

class ImageUploadRequest extends createZodDto(imageUploadRequestSchema) {}
class SetImageRequest extends createZodDto(setImageRequestSchema) {}
class UploadLinkResponse extends createZodDto(uploadLinkResponseSchema) {}
class MyCompanyResponse extends createZodDto(myCompanyResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const NO_IMAGE = {
  status: HttpStatus.NOT_FOUND,
  type: ErrorResponse.Output,
  description: 'No hay imagen guardada',
};

/** Foto de perfil propia y empresa cliente de la persona del portal (B22A). */
@ApiTags('Identidad')
@Controller('v1/me')
@OwnAccount()
@ApiCommonErrors()
export class MeMediaController {
  constructor(
    @Inject(ProfilePhotoUseCase) private readonly photo: ProfilePhotoUseCase,
    @Inject(MyCompanyQuery) private readonly company: MyCompanyQuery,
  ) {}

  @Post('photo/uploads')
  @ApiOperation({
    summary: 'Pedir el enlace para subir mi foto',
    description: 'PNG o JPG de hasta 2 MB. Después de subirla, el antivirus la revisa.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: UploadLinkResponse, description: 'Enlace' })
  async requestUpload(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ImageUploadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.photo.requestUpload(principal, body, meta);
  }

  @Put('photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Usar una imagen ya revisada como mi foto' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Foto cambiada' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'La imagen no es propia, no es PNG o JPG, o no ha pasado el antivirus',
  })
  async setPhoto(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SetImageRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.photo.set(principal, body.file_id, meta);
  }

  @Delete('photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar mi foto; vuelven las iniciales' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Foto quitada' })
  async removePhoto(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.photo.remove(principal, meta);
  }

  @Get('photo')
  @ApiOperation({ summary: 'Mi foto' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse(NO_IMAGE)
  async getPhoto(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.photo.open(principal));
  }

  @Get('company')
  @ApiOperation({ summary: 'Mi empresa cliente (portal)' })
  @ZodResponse({ status: HttpStatus.OK, type: MyCompanyResponse, description: 'Empresa' })
  async getCompany(@CurrentPrincipal() principal: Principal): Promise<MyCompanyResponse> {
    return this.company.company(principal);
  }

  @Get('company/logo')
  @ApiOperation({ summary: 'Logo de mi empresa cliente (portal)' })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiResponse({ status: HttpStatus.OK, description: 'La imagen' })
  @ApiResponse(NO_IMAGE)
  async getCompanyLogo(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return imageResponse(response, await this.company.logo(principal));
  }
}
