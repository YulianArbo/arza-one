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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  dispositionDecisionSchema,
  dispositionItemDecisionSchema,
  dispositionListQuerySchema,
  dispositionListResponseSchema,
  dispositionProposalDetailSchema,
  dispositionStepRequestSchema,
  downloadLinkResponseSchema,
  proposeDispositionsResponseSchema,
  type DispositionDecision,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { DispositionsUseCase } from '../application/dispositions.js';
import { transitionNotAllowed } from '../application/doc-messages.js';
import { ApiDocErrors, ApiIfMatch } from './doc-openapi.js';

class DispositionListQuery extends createZodDto(dispositionListQuerySchema) {}
class DispositionListResponse extends createZodDto(dispositionListResponseSchema) {}
class DispositionResponse extends createZodDto(dispositionProposalDetailSchema) {}
class ProposeDispositionsResponse extends createZodDto(proposeDispositionsResponseSchema) {}
class DispositionItemDecision extends createZodDto(dispositionItemDecisionSchema) {}
class DispositionStepRequest extends createZodDto(dispositionStepRequestSchema) {}
class DownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** La decisión de la ruta: aprobar o rechazar; otra no está permitida. */
class DecisionPipe {
  transform(value: unknown): DispositionDecision {
    const parsed = dispositionDecisionSchema.safeParse(value);
    if (!parsed.success) throw transitionNotAllowed();
    return parsed.data;
  }
}

/**
 * Disposición final (M03, B21; RE-SGC-005, numeral 12.4): propuestas mensuales, su revisión por
 * Calidad, su aprobación y el acta. Nada se elimina sin regla vencida y aprobación.
 */
@ApiTags('Documentos')
@Controller('v1/dispositions')
@ApiPermissionErrors()
export class DispositionsController {
  constructor(@Inject(DispositionsUseCase) private readonly dispositions: DispositionsUseCase) {}

  @RequirePermission('doc.disposition.approve')
  @Get()
  @ApiOperation({ summary: 'Propuestas de disposición', description: 'La más reciente primero.' })
  @ZodResponse({ status: HttpStatus.OK, type: DispositionListResponse, description: 'Página' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: DispositionListQuery,
  ): Promise<DispositionListResponse> {
    return this.dispositions.list(principal, ability, query);
  }

  @RequirePermission('doc.retention.manage')
  @Post('propose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar la propuesta del mes',
    description:
      'La misma que crea el sistema cada día: solo si aún no existe la del mes y hay documentos con la retención vencida. No elimina nada.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ProposeDispositionsResponse, description: 'Hecho' })
  async propose(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<ProposeDispositionsResponse> {
    return this.dispositions.propose(principal, meta);
  }

  @RequirePermission('doc.disposition.approve')
  @Get(':id')
  @ApiOperation({
    summary: 'Ver una propuesta de disposición',
    description: 'Con sus documentos, su paso actual y lo que la persona puede hacer.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DispositionResponse, description: 'Propuesta' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DispositionResponse> {
    return this.dispositions.get(principal, ability, id);
  }

  @RequirePermission('doc.retention.manage')
  @Put(':id/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Decidir un documento de la propuesta',
    description:
      'Conservarlo (con su motivo) o eliminarlo, como dice su regla. Solo mientras Calidad revisa la propuesta.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async decideItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Param('itemId', UUID) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DispositionItemDecision,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { proposalId: id, itemId, version: versionFromIfMatch(ifMatch) };
    await this.dispositions.decideItem({ principal, ability, meta }, target, body);
  }

  @RequirePermission('doc.retention.manage')
  @Post(':id/actions/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Enviar la propuesta a aprobación',
    description: 'Calidad la envía después de revisarla; quien la envía no la aprueba.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async send(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DispositionStepRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.dispositions.send({ principal, ability, meta }, target, body);
  }

  @RequirePermission('doc.disposition.approve')
  @Post(':id/actions/:decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'decision', enum: dispositionDecisionSchema.options })
  @ApiOperation({
    summary: 'Aprobar o rechazar la propuesta',
    description:
      'Rechazar exige el motivo. Aprobada, el sistema elimina el contenido de los documentos y genera el acta.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async decide(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Param('decision', DecisionPipe) decision: DispositionDecision,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DispositionStepRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.dispositions.decide({ principal, ability, meta }, target, decision, body);
  }

  @RequirePermission('doc.disposition.approve')
  @Post(':id/certificate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pedir el enlace de descarga del acta',
    description:
      'De la propuesta ejecutada. Recalcula la huella del archivo; si no coincide responde 409.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadLinkResponse, description: 'Enlace' })
  @ApiDocErrors()
  async certificate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.dispositions.certificateLink(principal, id, meta);
  }
}
