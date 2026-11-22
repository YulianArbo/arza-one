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
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createManagementReviewSchema,
  downloadLinkResponseSchema,
  managementReviewListResponseSchema,
  managementReviewSchema,
  qmsCodeResponseSchema,
  returnManagementReviewSchema,
  updateManagementReviewSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { QualityFiles } from '../application/quality-files.js';
import { ReviewSteps } from '../application/review-steps.js';
import { ManagementReviews } from '../application/reviews.js';

class QmsReviewListResponse extends createZodDto(managementReviewListResponseSchema) {}
class QmsReviewResponse extends createZodDto(managementReviewSchema) {}
class QmsCreateReviewBody extends createZodDto(createManagementReviewSchema) {}
class QmsUpdateReviewBody extends createZodDto(updateManagementReviewSchema) {}
class QmsReturnReviewBody extends createZodDto(returnManagementReviewSchema) {}
class QmsReviewCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
class QmsReviewLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Revisión por la dirección (B39; RE-SGC-007): Calidad prepara el acta con las entradas
// precargadas y la Dirección la aprueba (decisión 5).

@ApiTags('Calidad')
@Controller('v1/qms/management-reviews')
@ApiPermissionErrors()
export class ReviewsController {
  constructor(
    @Inject(ManagementReviews) private readonly reviews: ManagementReviews,
    @Inject(ReviewSteps) private readonly steps: ReviewSteps,
    @Inject(QualityFiles) private readonly files: QualityFiles,
  ) {}

  @Post(':id/download-link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Pedir el enlace del acta aprobada en PDF' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsReviewLinkResponse, description: 'Enlace' })
  async downloadLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<QmsReviewLinkResponse> {
    return this.files.reviewLink({ principal, ability }, id, meta);
  }

  @Get()
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar las actas de revisión por la dirección' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsReviewListResponse, description: 'Lista' })
  async list(@CurrentPrincipal() principal: Principal): Promise<QmsReviewListResponse> {
    return { data: await this.reviews.list(principal) };
  }

  @Get(':id')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Ver un acta con sus entradas y decisiones' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsReviewResponse, description: 'Acta' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<QmsReviewResponse> {
    return this.reviews.detail(principal, id);
  }

  @Post()
  @RequirePermission('qms.review.manage')
  @ApiOperation({ summary: 'Crear un acta de revisión por la dirección' })
  @ZodResponse({ status: HttpStatus.CREATED, type: QmsReviewCodeResponse, description: 'Creada' })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: QmsCreateReviewBody,
  ): Promise<QmsReviewCodeResponse> {
    return this.reviews.create(principal, meta, input);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.review.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Preparar el acta: comentarios, conclusiones y decisiones' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsUpdateReviewBody,
  ): Promise<void> {
    await this.reviews.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/load-inputs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.review.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Precargar las entradas con las cifras del periodo' })
  async loadInputs(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.steps.loadInputs(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post(':id/actions/submit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.review.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Enviar el acta a la Dirección para su aprobación' })
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.steps.submit(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post(':id/actions/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.review.approve')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Devolver el acta a Calidad con el motivo' })
  async returnToDraft(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsReturnReviewBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.returnToDraft(principal, meta, target, input);
  }

  @Post(':id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.review.approve')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar el acta; sus decisiones se vuelven acciones de mejora' })
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.steps.approve(principal, meta, { id, version: versionFromIfMatch(version) });
  }
}
