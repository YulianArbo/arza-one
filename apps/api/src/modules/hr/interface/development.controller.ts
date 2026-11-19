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
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  agreeReviewSchema,
  cancelTrainingSchema,
  createReviewSchema,
  hrCreatedResponseSchema,
  performanceReviewListResponseSchema,
  recordAttendanceSchema,
  saveTrainingSchema,
  scoreReviewSchema,
  trainingListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PerformanceReviews } from '../application/performance-reviews.js';
import { Trainings } from '../application/trainings.js';

class ReviewListResponse extends createZodDto(performanceReviewListResponseSchema) {}
class CreateReviewBody extends createZodDto(createReviewSchema) {}
class ScoreReviewBody extends createZodDto(scoreReviewSchema) {}
class AgreeReviewBody extends createZodDto(agreeReviewSchema) {}
class TrainingListResponse extends createZodDto(trainingListResponseSchema) {}
class SaveTrainingBody extends createZodDto(saveTrainingSchema) {}
class AttendanceBody extends createZodDto(recordAttendanceSchema) {}
class CancelTrainingBody extends createZodDto(cancelTrainingSchema) {}
class CreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Evaluación de desempeño y formación (B36, decisión 7). La evaluación la crean y califican
// Talento humano o el jefe inmediato (el caso de uso lo revisa) y la acepta el colaborador. La
// formación la gestiona Talento humano.

@ApiTags('Talento Humano')
@Controller('v1/hr')
@ApiPermissionErrors()
export class DevelopmentController {
  constructor(
    @Inject(PerformanceReviews) private readonly reviews: PerformanceReviews,
    @Inject(Trainings) private readonly trainings: Trainings,
  ) {}

  @Get('performance-reviews')
  @RequirePermission('hr.performance.manage')
  @ApiOperation({ summary: 'Consultar las evaluaciones de desempeño de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: ReviewListResponse, description: 'Evaluaciones' })
  async reviewList(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<ReviewListResponse> {
    return { data: await this.reviews.list({ principal, ability }, 'all') };
  }

  @Post('performance-reviews')
  @RequirePermission('hr.employee.read')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Fijar los objetivos de una evaluación (Talento humano o el jefe)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Creada' })
  async createReview(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateReviewBody,
  ): Promise<CreatedResponse> {
    const viewer = { principal, ability };
    return { id: await this.reviews.create(viewer, meta, idempotencyKeyFrom(key), input) };
  }

  @Post('performance-reviews/:id/actions/score')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.read')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Calificar una evaluación de desempeño' })
  async score(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: ScoreReviewBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.reviews.score({ principal, ability }, meta, target, input);
  }

  @Post('performance-reviews/:id/actions/agree')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.read')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aceptar la evaluación propia' })
  async agree(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: AgreeReviewBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.reviews.agree({ principal, ability }, meta, target, input);
  }

  @Get('trainings')
  @RequirePermission('hr.training.manage')
  @ApiOperation({ summary: 'Consultar la formación y el bienestar' })
  @ZodResponse({ status: HttpStatus.OK, type: TrainingListResponse, description: 'Formación' })
  async trainingList(@CurrentPrincipal() principal: Principal): Promise<TrainingListResponse> {
    return { data: await this.trainings.list(principal) };
  }

  @Post('trainings')
  @RequirePermission('hr.training.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Programar una formación o actividad de bienestar' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Programada' })
  async createTraining(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SaveTrainingBody,
  ): Promise<CreatedResponse> {
    return { id: await this.trainings.create(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post('trainings/:id/actions/attendance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.training.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar la asistencia y la calificación' })
  async attendance(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: AttendanceBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.trainings.recordAttendance(principal, meta, target, input);
  }

  @Post('trainings/:id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.training.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Cancelar una formación programada' })
  async cancelTraining(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CancelTrainingBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.trainings.cancel(principal, meta, target, input);
  }
}
