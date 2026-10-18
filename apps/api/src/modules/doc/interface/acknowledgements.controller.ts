import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { acknowledgementReportSchema, acknowledgementRequestResponseSchema } from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AcknowledgementsUseCase } from '../application/acknowledgements.js';
import { ApiDocErrors } from './doc-openapi.js';

class AcknowledgementReport extends createZodDto(acknowledgementReportSchema) {}
class AcknowledgementRequestResponse extends createZodDto(acknowledgementRequestResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** Constancia de lectura de la versión vigente de un documento (M03, B19; ficha 17.4). */
@ApiTags('Documentos')
@Controller('v1/documents/:id')
@ApiPermissionErrors()
export class AcknowledgementsController {
  constructor(
    @Inject(AcknowledgementsUseCase) private readonly acknowledgements: AcknowledgementsUseCase,
  ) {}

  @RequirePermission('doc.document.read')
  @Get('acknowledgements')
  @ApiOperation({
    summary: 'Ver la constancia de lectura de la versión vigente',
    description:
      'La de la persona y, para quien ve todos los documentos, quién confirmó y quién falta, por cargo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: AcknowledgementReport, description: 'Informe' })
  @ApiDocErrors()
  async report(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<AcknowledgementReport> {
    return this.acknowledgements.report(principal, ability, id);
  }

  @RequirePermission('doc.document.read')
  @Post('acknowledgements/mine')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirmar que leyó la versión vigente',
    description: 'Confirmar dos veces no cambia nada. Queda en la auditoría.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Confirmada' })
  @ApiDocErrors()
  async confirm(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.acknowledgements.confirm(principal, ability, id, meta);
  }

  @RequirePermission('doc.version.publish')
  @Post('acknowledgement-requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pedir la lectura de la versión vigente',
    description:
      'A las personas de los cargos vinculados con «Aplica a» que aún no confirmaron; les llega un aviso.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: AcknowledgementRequestResponse,
    description: 'A cuántas personas se les pidió',
  })
  @ApiDocErrors()
  async request(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<AcknowledgementRequestResponse> {
    return this.acknowledgements.request(principal, ability, id, meta);
  }
}
