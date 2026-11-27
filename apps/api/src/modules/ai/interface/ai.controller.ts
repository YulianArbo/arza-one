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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  aiAnswerSchema,
  aiAssistRequestSchema,
  aiReviewRequestSchema,
  aiSearchRequestSchema,
  aiStatusSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AiAssist } from '../application/assist.js';
import { AiUsage } from '../application/usage.js';

class AiStatusResponse extends createZodDto(aiStatusSchema) {}
class AiSearchBody extends createZodDto(aiSearchRequestSchema) {}
class AiAssistBody extends createZodDto(aiAssistRequestSchema) {}
class AiAnswerResponse extends createZodDto(aiAnswerSchema) {}
class AiReviewBody extends createZodDto(aiReviewRequestSchema) {}

// Asistente de inteligencia artificial (M20, B47, ficha 17.21). Hereda los permisos de la persona:
// solo trabaja con lo que ella puede ver. Sus respuestas son propuestas; nunca ejecuta acciones.

@ApiTags('Asistente de IA')
@Controller('v1/ai')
@ApiPermissionErrors()
export class AiController {
  constructor(
    @Inject(AiAssist) private readonly assistant: AiAssist,
    @Inject(AiUsage) private readonly usage: AiUsage,
  ) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('ai.assist.use')
  @ApiOperation({ summary: 'Usos activos del asistente y cuántos le quedan hoy a la persona' })
  @ZodResponse({ status: HttpStatus.OK, type: AiStatusResponse, description: 'Estado' })
  async status(@CurrentPrincipal() principal: Principal): Promise<AiStatusResponse> {
    return this.usage.status(principal);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('ai.assist.use')
  @ApiOperation({
    summary:
      'Preguntar sobre los documentos que la persona puede abrir; la respuesta cita sus fuentes',
  })
  @ZodResponse({ status: HttpStatus.OK, type: AiAnswerResponse, description: 'Respuesta' })
  async search(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: AiSearchBody,
  ): Promise<AiAnswerResponse> {
    return this.assistant.search({ principal, ability }, meta, input.question);
  }

  @Post('assist')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('ai.assist.use')
  @ApiOperation({
    summary:
      'Resumen, borrador de respuesta o clasificación sugerida de un documento, tiquete o PQRSF',
  })
  @ZodResponse({ status: HttpStatus.OK, type: AiAnswerResponse, description: 'Propuesta' })
  async assist(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: AiAssistBody,
  ): Promise<AiAnswerResponse> {
    return this.assistant.assist({ principal, ability }, meta, input.use_case, input.target_id);
  }

  @Post('requests/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('ai.assist.use')
  @ApiOperation({ summary: 'Decir si la persona usó o descartó la propuesta del asistente' })
  async review(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Body() input: AiReviewBody,
  ): Promise<void> {
    await this.usage.review(principal, meta, id, input.decision);
  }
}
