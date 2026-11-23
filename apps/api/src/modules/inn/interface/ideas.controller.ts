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
  downloadLinkResponseSchema,
  ideaDecisionSchema,
  ideaListResponseSchema,
  ideaProgressSchema,
  ideaQuerySchema,
  innCodeResponseSchema,
  saveIdeaSchema,
  submitViabilitySchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { IdeaSteps } from '../application/idea-steps.js';
import { Ideas } from '../application/ideas.js';
import { InnFiles } from '../application/inn-files.js';

class InnIdeaListResponse extends createZodDto(ideaListResponseSchema) {}
class InnIdeaQuery extends createZodDto(ideaQuerySchema) {}
class InnIdeaBody extends createZodDto(saveIdeaSchema) {}
class InnViabilityBody extends createZodDto(submitViabilitySchema) {}
class InnIdeaDecisionBody extends createZodDto(ideaDecisionSchema) {}
class InnIdeaProgressBody extends createZodDto(ideaProgressSchema) {}
class InnIdeaCodeResponse extends createZodDto(innCodeResponseSchema) {}
class InnViabilityLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Banco de ideas y su evaluación de viabilidad FT-INN-003 (B40, ficha 17.16).

@ApiTags('Innovación')
@Controller('v1/innovation')
@ApiPermissionErrors()
export class IdeasController {
  constructor(
    @Inject(Ideas) private readonly ideas: Ideas,
    @Inject(IdeaSteps) private readonly steps: IdeaSteps,
    @Inject(InnFiles) private readonly files: InnFiles,
  ) {}

  @Get('ideas')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Consultar el banco de ideas, por estado' })
  @ZodResponse({ status: HttpStatus.OK, type: InnIdeaListResponse, description: 'Ideas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: InnIdeaQuery,
  ): Promise<InnIdeaListResponse> {
    return { data: await this.ideas.list(principal, query.stage) };
  }

  @Get('my/ideas')
  @RequirePermission('inn.idea.create')
  @ApiOperation({ summary: 'Consultar las ideas que yo propuse' })
  @ZodResponse({ status: HttpStatus.OK, type: InnIdeaListResponse, description: 'Mis ideas' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<InnIdeaListResponse> {
    return { data: await this.ideas.mine(principal) };
  }

  @Post('ideas')
  @RequirePermission('inn.idea.create')
  @ApiOperation({ summary: 'Proponer una idea' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InnIdeaCodeResponse, description: 'Inscrita' })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: InnIdeaBody,
  ): Promise<InnIdeaCodeResponse> {
    return this.ideas.create(principal, meta, input);
  }

  @Patch('ideas/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.idea.create')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Corregir una idea propia mientras sigue inscrita' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnIdeaBody,
  ): Promise<void> {
    await this.ideas.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('ideas/:id/evaluation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.idea.evaluate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Iniciar la evaluación de una idea; no la propia' })
  async startEvaluation(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.steps.startEvaluation(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post('ideas/:id/viability')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.idea.evaluate')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Diligenciar la evaluación de viabilidad FT-INN-003' })
  async submitViability(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnViabilityBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.submitViability(principal, meta, target, input);
  }

  @Post('ideas/:id/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.idea.approve')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar o archivar una idea; aprobar exige la evaluación' })
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnIdeaDecisionBody,
  ): Promise<void> {
    await this.steps.decide(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('ideas/:id/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.idea.approve')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Pasar una idea aprobada a desarrollo, o marcarla implementada' })
  async progress(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnIdeaProgressBody,
  ): Promise<void> {
    await this.steps.progress(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('ideas/:id/viability/download-link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Pedir el enlace del PDF de la evaluación de viabilidad' })
  @ZodResponse({ status: HttpStatus.OK, type: InnViabilityLinkResponse, description: 'Enlace' })
  async viabilityLink(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<InnViabilityLinkResponse> {
    return this.files.viabilityLink(principal, id, meta);
  }
}
