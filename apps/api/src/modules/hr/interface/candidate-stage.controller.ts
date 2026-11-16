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
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addSelectionEvaluationSchema,
  advanceCandidateSchema,
  candidateListQuerySchema,
  candidateListResponseSchema,
  discardCandidateSchema,
  hireCandidateSchema,
  noticeListResponseSchema,
  hrCreatedResponseSchema,
  registerCandidateSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CandidateStageUseCase } from '../application/candidate-stage.js';
import { CandidateRegistration } from '../application/candidate-registration.js';
import { CandidateList } from '../application/candidate-list.js';
import { CandidateEvaluations } from '../application/candidate-evaluations.js';
import { Hiring } from '../application/hiring.js';

class AdvanceCandidateBody extends createZodDto(advanceCandidateSchema) {}
class DiscardCandidateBody extends createZodDto(discardCandidateSchema) {}
class RegisterCandidateBody extends createZodDto(registerCandidateSchema) {}
class CandidateCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
class CandidateListQuery extends createZodDto(candidateListQuerySchema) {}
class CandidateListResponse extends createZodDto(candidateListResponseSchema) {}
class SelectionEvaluationBody extends createZodDto(addSelectionEvaluationSchema) {}
class HireCandidateBody extends createZodDto(hireCandidateSchema) {}
class CandidateNoticesResponse extends createZodDto(noticeListResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('Talento Humano')
@Controller('v1/hr/candidates')
@ApiPermissionErrors()
export class CandidateStageController {
  constructor(
    @Inject(CandidateStageUseCase) private readonly stages: CandidateStageUseCase,
    @Inject(CandidateRegistration) private readonly registration: CandidateRegistration,
    @Inject(CandidateList) private readonly candidates: CandidateList,
    @Inject(CandidateEvaluations) private readonly evaluations: CandidateEvaluations,
    @Inject(Hiring) private readonly hiring: Hiring,
  ) {}

  @Get('authorization-notices')
  @RequirePermission('hr.candidate.manage')
  @ApiOperation({ summary: 'Consultar el texto vigente de autorización de selección' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: CandidateNoticesResponse,
    description: 'Aviso de selección',
  })
  async authorizationNotices(
    @CurrentPrincipal() principal: Principal,
  ): Promise<CandidateNoticesResponse> {
    return { data: await this.candidates.authorizationNotices(principal) };
  }

  @Get()
  @RequirePermission('hr.candidate.manage')
  @ApiOperation({ summary: 'Consultar candidaturas de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: CandidateListResponse, description: 'Candidaturas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: CandidateListQuery,
  ): Promise<CandidateListResponse> {
    return { data: await this.candidates.list(principal, query) };
  }

  @Post()
  @RequirePermission('hr.candidate.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una candidatura con su autorización de tratamiento' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: CandidateCreatedResponse,
    description: 'Candidatura registrada',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RegisterCandidateBody,
  ): Promise<CandidateCreatedResponse> {
    return { id: await this.registration.create(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/evaluations')
  @RequirePermission('hr.candidate.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una evaluación de selección' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: CandidateCreatedResponse,
    description: 'Evaluación registrada',
  })
  async evaluate(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) candidateId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SelectionEvaluationBody,
  ): Promise<CandidateCreatedResponse> {
    return {
      id: await this.evaluations.create(
        principal,
        meta,
        { candidateId, requestKey: idempotencyKeyFrom(key) },
        input,
      ),
    };
  }

  @Post(':id/actions/advance')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la candidatura' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.candidate.manage')
  @ApiOperation({ summary: 'Avanzar una candidatura a la siguiente etapa' })
  async advance(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: AdvanceCandidateBody,
  ): Promise<void> {
    await this.stages.change(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      { kind: 'advance', note: input.note },
    );
  }

  @Post(':id/actions/prepare-hiring')
  @RequirePermission('hr.employee.manage')
  @ApiIdempotencyKey()
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la candidatura' })
  @ApiOperation({ summary: 'Preparar la vinculación y enviar el contrato laboral a firma' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: CandidateCreatedResponse,
    description: 'Vinculación preparada',
  })
  async prepareHiring(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: HireCandidateBody,
  ): Promise<CandidateCreatedResponse> {
    return {
      id: await this.hiring.prepare(
        principal,
        meta,
        { id, version: versionFromIfMatch(version), key: idempotencyKeyFrom(key) },
        input,
      ),
    };
  }

  @Post(':id/actions/discard')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión de la candidatura' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.candidate.manage')
  @ApiOperation({ summary: 'Descartar una candidatura y programar la eliminación de sus datos' })
  async discard(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: DiscardCandidateBody,
  ): Promise<void> {
    await this.stages.change(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      { kind: 'discard', reason: input.reason },
    );
  }
}
