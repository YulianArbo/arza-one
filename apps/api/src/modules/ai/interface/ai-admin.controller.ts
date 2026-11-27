import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  aiCreatedResponseSchema,
  aiPromptListResponseSchema,
  aiRequestListQuerySchema,
  aiRequestListResponseSchema,
  aiUseCaseListResponseSchema,
  aiUseCaseSchema,
  createAiPromptSchema,
  saveAiUseCaseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { aiNotFound } from '../application/ai-support.js';
import { AiGovernance } from '../application/governance.js';
import { AiUsage } from '../application/usage.js';

class AiUseCaseListResponse extends createZodDto(aiUseCaseListResponseSchema) {}
class AiUseCaseBody extends createZodDto(saveAiUseCaseSchema) {}
class AiPromptListResponse extends createZodDto(aiPromptListResponseSchema) {}
class AiPromptBody extends createZodDto(createAiPromptSchema) {}
class AiCreatedResponse extends createZodDto(aiCreatedResponseSchema) {}
class AiRequestListQuery extends createZodDto(aiRequestListQuerySchema) {}
class AiRequestListResponse extends createZodDto(aiRequestListResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });

// Gobierno del asistente (B47): activación de los usos con su evaluación de impacto (Oficial de
// datos), instrucciones con versiones (Calidad y administrador) y registro de usos (Oficial de
// datos, auditor y administrador).

@ApiTags('Asistente de IA')
@Controller('v1/ai')
@ApiPermissionErrors()
export class AiAdminController {
  constructor(
    @Inject(AiGovernance) private readonly governance: AiGovernance,
    @Inject(AiUsage) private readonly usage: AiUsage,
  ) {}

  @Get('use-cases')
  @RequirePermission('ai.use_case.manage')
  @ApiOperation({ summary: 'Usos del asistente, activos o no, con su evaluación de impacto' })
  @ZodResponse({ status: HttpStatus.OK, type: AiUseCaseListResponse, description: 'Usos' })
  async useCases(@CurrentPrincipal() principal: Principal): Promise<AiUseCaseListResponse> {
    return { data: await this.governance.useCases(principal) };
  }

  @Put('use-cases/:useCase')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ai.use_case.manage')
  @ApiOperation({ summary: 'Activar o apagar un uso; activarlo exige la evaluación de impacto' })
  async saveUseCase(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('useCase') useCase: string,
    @Body() input: AiUseCaseBody,
  ): Promise<void> {
    const parsed = aiUseCaseSchema.safeParse(useCase);
    if (!parsed.success) throw aiNotFound('Ese uso del asistente no existe.');
    await this.governance.saveUseCase(principal, meta, parsed.data, input);
  }

  @Get('prompts')
  @RequirePermission('ai.prompt.manage')
  @ApiOperation({ summary: 'Instrucciones del asistente con sus versiones' })
  @ZodResponse({ status: HttpStatus.OK, type: AiPromptListResponse, description: 'Instrucciones' })
  async prompts(@CurrentPrincipal() principal: Principal): Promise<AiPromptListResponse> {
    return this.governance.prompts(principal);
  }

  @Post('prompts')
  @RequirePermission('ai.prompt.manage')
  @ApiOperation({ summary: 'Escribir una nueva versión de la instrucción de un uso (borrador)' })
  @ZodResponse({ status: HttpStatus.CREATED, type: AiCreatedResponse, description: 'Creada' })
  async createPrompt(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: AiPromptBody,
  ): Promise<AiCreatedResponse> {
    return { id: await this.governance.createPrompt(principal, meta, input) };
  }

  @Post('prompts/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ai.prompt.manage')
  @ApiOperation({ summary: 'Aprobar una instrucción escrita por otra persona; pasa a regir' })
  async approvePrompt(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<void> {
    await this.governance.approvePrompt(principal, meta, id);
  }

  @Get('requests')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('ai.request.read')
  @ApiOperation({ summary: 'Registro de usos del asistente; la consulta queda auditada' })
  @ZodResponse({ status: HttpStatus.OK, type: AiRequestListResponse, description: 'Usos' })
  async requests(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Query() query: AiRequestListQuery,
  ): Promise<AiRequestListResponse> {
    return this.usage.list(principal, meta, query);
  }
}
