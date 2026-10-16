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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createNoticeRequestSchema,
  noticeListQuerySchema,
  noticeListResponseSchema,
  noticeSchema,
  updateNoticeRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { NoticesUseCase } from '../application/notices.js';
import { ApiIfMatch, ApiPrivacyErrors, PrivacyCreatedResponse } from './privacy-openapi.js';

class NoticeListQuery extends createZodDto(noticeListQuerySchema) {}
class NoticeListResponse extends createZodDto(noticeListResponseSchema) {}
class NoticeResponse extends createZodDto(noticeSchema) {}
class CreateNoticeRequest extends createZodDto(createNoticeRequestSchema) {}
class UpdateNoticeRequest extends createZodDto(updateNoticeRequestSchema) {}

/** Avisos y políticas de privacidad versionados (M18, B17): Privacidad › Avisos y versiones. */
@ApiTags('Privacidad')
@Controller('v1/notices')
@RequirePermission('privacy.notice.manage')
@ApiPermissionErrors()
export class NoticesController {
  constructor(@Inject(NoticesUseCase) private readonly notices: NoticesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Textos de privacidad, por clase y de la versión más nueva a la vieja' })
  @ZodResponse({ status: HttpStatus.OK, type: NoticeListResponse, description: 'Textos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: NoticeListQuery,
  ): Promise<NoticeListResponse> {
    return { data: await this.notices.list(principal, query) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crear el borrador de una versión nueva',
    description: 'Uno a la vez por clase de texto; las autorizaciones llevan sus finalidades.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PrivacyCreatedResponse, description: 'Creado' })
  @ApiPrivacyErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateNoticeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.notices.create(principal, body, meta) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un texto de privacidad' })
  @ZodResponse({ status: HttpStatus.OK, type: NoticeResponse, description: 'Texto' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<NoticeResponse> {
    return this.notices.get(principal, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un borrador', description: 'Lo publicado no cambia (409).' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: NoticeResponse, description: 'Borrador' })
  @ApiPrivacyErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateNoticeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<NoticeResponse> {
    return this.notices.update(principal, id, versionFromIfMatch(ifMatch), body, meta);
  }

  @Post(':id/actions/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publicar el borrador',
    description: 'Rige desde ya y reemplaza la versión publicada de la misma clase.',
  })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: NoticeResponse, description: 'Publicado' })
  @ApiPrivacyErrors()
  async publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<NoticeResponse> {
    return this.notices.publish(principal, id, versionFromIfMatch(ifMatch), meta);
  }
}
