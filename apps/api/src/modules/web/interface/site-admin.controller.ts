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
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  approveLegalTextSchema,
  createLegalTextSchema,
  legalTextListResponseSchema,
  legalTextQuerySchema,
  pageActionSchema,
  pageListResponseSchema,
  savePageSchema,
  siteCreatedResponseSchema,
  submissionListResponseSchema,
  submissionQuerySchema,
  unsubscribeListResponseSchema,
  updateLegalTextSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { LegalTexts } from '../application/legal-texts.js';
import { Pages } from '../application/pages.js';
import { Submissions } from '../application/submissions.js';

class SitePageList extends createZodDto(pageListResponseSchema) {}
class SitePageBody extends createZodDto(savePageSchema) {}
class SitePageActionBody extends createZodDto(pageActionSchema) {}
class SiteLegalTextList extends createZodDto(legalTextListResponseSchema) {}
class SiteLegalTextQuery extends createZodDto(legalTextQuerySchema) {}
class SiteLegalTextCreateBody extends createZodDto(createLegalTextSchema) {}
class SiteLegalTextUpdateBody extends createZodDto(updateLegalTextSchema) {}
class SiteLegalTextApproveBody extends createZodDto(approveLegalTextSchema) {}
class SiteSubmissionList extends createZodDto(submissionListResponseSchema) {}
class SiteSubmissionQuery extends createZodDto(submissionQuerySchema) {}
class SiteUnsubscribeList extends createZodDto(unsubscribeListResponseSchema) {}
class SiteCreatedResponse extends createZodDto(siteCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Administración del sitio (B41, ficha 17.18): páginas, textos legales versionados, formularios
// recibidos y bajas de comunicaciones comerciales.

@ApiTags('Sitio web')
@Controller('v1/site')
@ApiPermissionErrors()
export class SiteAdminController {
  constructor(
    @Inject(Pages) private readonly pages: Pages,
    @Inject(LegalTexts) private readonly texts: LegalTexts,
    @Inject(Submissions) private readonly submissions: Submissions,
  ) {}

  @Get('pages')
  @RequirePermission('web.page.manage')
  @ApiOperation({ summary: 'Páginas del sitio, en cualquier estado' })
  @ZodResponse({ status: HttpStatus.OK, type: SitePageList, description: 'Páginas' })
  async listPages(@CurrentPrincipal() principal: Principal): Promise<SitePageList> {
    return { data: await this.pages.list(principal) };
  }

  @Post('pages')
  @RequirePermission('web.page.manage')
  @ApiOperation({ summary: 'Crear una página en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SiteCreatedResponse, description: 'Creada' })
  async createPage(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: SitePageBody,
  ): Promise<SiteCreatedResponse> {
    return { id: await this.pages.create(principal, meta, input) };
  }

  @Patch('pages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('web.page.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar una página; si está publicada, el cambio se ve de inmediato' })
  async updatePage(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SitePageBody,
  ): Promise<void> {
    await this.pages.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('pages/:id/actions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('web.page.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Publicar o retirar una página' })
  async actOnPage(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SitePageActionBody,
  ): Promise<void> {
    await this.pages.act(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('legal-texts')
  @RequirePermission('web.legal_text.manage')
  @ApiOperation({ summary: 'Textos legales con todas sus versiones' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteLegalTextList, description: 'Versiones' })
  async listTexts(
    @CurrentPrincipal() principal: Principal,
    @Query() query: SiteLegalTextQuery,
  ): Promise<SiteLegalTextList> {
    return { data: await this.texts.list(principal, query.key) };
  }

  @Post('legal-texts')
  @RequirePermission('web.legal_text.manage')
  @ApiOperation({ summary: 'Redactar una nueva versión en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SiteCreatedResponse, description: 'Creada' })
  async createText(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: SiteLegalTextCreateBody,
  ): Promise<SiteCreatedResponse> {
    return { id: await this.texts.create(principal, meta, input) };
  }

  @Patch('legal-texts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('web.legal_text.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar el borrador' })
  async updateText(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SiteLegalTextUpdateBody,
  ): Promise<void> {
    await this.texts.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('legal-texts/:id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('web.legal_text.publish')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar el borrador; nadie aprueba lo que redactó' })
  async approveText(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SiteLegalTextApproveBody,
  ): Promise<void> {
    await this.texts.approve(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('legal-texts/:id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('web.legal_text.publish')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Publicar la versión aprobada; la anterior queda reemplazada' })
  async publishText(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.texts.publish(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Get('submissions')
  @RequirePermission('web.submission.read')
  @ApiOperation({ summary: 'Formularios recibidos en el sitio' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteSubmissionList, description: 'Recibidos' })
  async listSubmissions(
    @CurrentPrincipal() principal: Principal,
    @Query() query: SiteSubmissionQuery,
  ): Promise<SiteSubmissionList> {
    return { data: await this.submissions.list(principal, query.form_key) };
  }

  @Get('unsubscribes')
  @RequirePermission('web.submission.read')
  @ApiOperation({ summary: 'Bajas de comunicaciones comerciales' })
  @ZodResponse({ status: HttpStatus.OK, type: SiteUnsubscribeList, description: 'Bajas' })
  async listUnsubscribes(@CurrentPrincipal() principal: Principal): Promise<SiteUnsubscribeList> {
    return { data: await this.submissions.unsubscribes(principal) };
  }
}
