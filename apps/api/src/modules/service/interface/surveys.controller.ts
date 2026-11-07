import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  surveyListResponseSchema,
  surveyResultsQuerySchema,
  surveyResultsSchema,
  updateSurveyRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { SurveysUseCase } from '../application/surveys.js';
import { ApiServiceIfMatch, ApiServiceWriteErrors, UUID } from './service-openapi.js';

class SurveyListResponse extends createZodDto(surveyListResponseSchema) {}
class UpdateSurveyRequest extends createZodDto(updateSurveyRequestSchema) {}
class SurveyResultsQuery extends createZodDto(surveyResultsQuerySchema) {}
class SurveyResultsResponse extends createZodDto(surveyResultsSchema) {}

/** Encuestas de satisfacción y NPS (M08, B29; ficha 17.9, FT-SAC-003). */
@ApiTags('Servicio')
@Controller('v1')
@ApiPermissionErrors()
export class SurveysController {
  constructor(@Inject(SurveysUseCase) private readonly surveys: SurveysUseCase) {}

  @RequirePermission('service.ticket.read')
  @Get('surveys')
  @ApiOperation({ summary: 'Encuestas', description: 'Sus textos y si están encendidas.' })
  @ZodResponse({ status: HttpStatus.OK, type: SurveyListResponse, description: 'Encuestas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<SurveyListResponse> {
    return this.surveys.list(principal, ability);
  }

  @RequirePermission('service.survey.manage')
  @Put('surveys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar una encuesta',
    description: 'Los textos de las preguntas, el nombre y si se envía o no.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiServiceWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateSurveyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.surveys.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('service.ticket.read')
  @Get('survey-responses')
  @ApiOperation({
    summary: 'Resultados y NPS',
    description: 'Del periodo: enviadas, respondidas, NPS, satisfacción y cada respuesta.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SurveyResultsResponse, description: 'Resultados' })
  async results(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: SurveyResultsQuery,
  ): Promise<SurveyResultsResponse> {
    return this.surveys.results(principal, ability, query);
  }
}
