import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  actionQuerySchema,
  createQmsActionSchema,
  executeQmsActionSchema,
  qmsActionListResponseSchema,
  qmsCodeResponseSchema,
  updateQmsActionSchema,
  verifyQmsActionSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ActionSteps } from '../application/action-steps.js';
import { Actions } from '../application/actions.js';

class QmsActionListResponse extends createZodDto(qmsActionListResponseSchema) {}
class QmsActionQuery extends createZodDto(actionQuerySchema) {}
class QmsCreateActionBody extends createZodDto(createQmsActionSchema) {}
class QmsUpdateActionBody extends createZodDto(updateQmsActionSchema) {}
class QmsExecuteActionBody extends createZodDto(executeQmsActionSchema) {}
class QmsVerifyActionBody extends createZodDto(verifyQmsActionSchema) {}
class QmsActionCodeResponse extends createZodDto(qmsCodeResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Acciones correctivas y de mejora y su bitácora RE-SGC-002 (B38, decisiones 8, 10 y 11).

@ApiTags('Calidad')
@Controller('v1/qms/actions')
@ApiPermissionErrors()
export class ActionsController {
  constructor(
    @Inject(Actions) private readonly actions: Actions,
    @Inject(ActionSteps) private readonly steps: ActionSteps,
  ) {}

  @Get()
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Consultar la bitácora de acciones (RE-SGC-002)' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsActionListResponse, description: 'Bitácora' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: QmsActionQuery,
  ): Promise<QmsActionListResponse> {
    return { data: await this.actions.list(principal, query) };
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Descargar la bitácora de acciones (CSV)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.actions.export(principal, meta);
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }

  @Post()
  @RequirePermission('qms.action.manage')
  @ApiOperation({ summary: 'Registrar una acción con responsable y fecha compromiso' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: QmsActionCodeResponse,
    description: 'Registrada',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: QmsCreateActionBody,
  ): Promise<QmsActionCodeResponse> {
    return this.actions.create({ principal, ability }, meta, input);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.action.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Ajustar una acción abierta: qué, quién y para cuándo' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsUpdateActionBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.actions.update({ principal, ability }, meta, target, input);
  }

  @Post(':id/actions/execute')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.action.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Marcar ejecutada una acción, con su evidencia' })
  async execute(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsExecuteActionBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.execute({ principal, ability }, meta, target, input);
  }

  @Post(':id/actions/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('qms.action.verify')
  @ApiHeader(IF_MATCH)
  @ApiOperation({
    summary: 'Verificar la eficacia; la hace alguien distinto del responsable y de quien ejecutó',
  })
  async verify(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: QmsVerifyActionBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.steps.verify({ principal, ability }, meta, target, input);
  }
}
