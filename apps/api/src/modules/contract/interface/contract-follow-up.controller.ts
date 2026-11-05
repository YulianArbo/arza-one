import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  amendmentDecisionRequestSchema,
  completeObligationRequestSchema,
  contractPdfRequestSchema,
  createAmendmentRequestSchema,
  downloadLinkResponseSchema,
  obligationRequestSchema,
  registerSignatureRequestSchema,
  renewContractRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AmendmentsUseCase } from '../application/amendments.js';
import { ContractQueries } from '../application/contract-queries.js';
import { ObligationsUseCase } from '../application/obligations.js';
import {
  ApiContractIfMatch,
  ApiContractWriteErrors,
  ContractCreatedResponse,
} from './contract-openapi.js';

class ObligationRequest extends createZodDto(obligationRequestSchema) {}
class CompleteObligationRequest extends createZodDto(completeObligationRequestSchema) {}
class CreateAmendmentRequest extends createZodDto(createAmendmentRequestSchema) {}
class AmendmentDecisionRequest extends createZodDto(amendmentDecisionRequestSchema) {}
class AmendmentSignatureRequest extends createZodDto(registerSignatureRequestSchema) {}
class RenewContractRequest extends createZodDto(renewContractRequestSchema) {}
class AmendmentPdfRequest extends createZodDto(contractPdfRequestSchema) {}
class AmendmentPdfLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** Obligaciones, otrosíes y prórrogas de un contrato (M06, B24; ficha 17.7). */
@ApiTags('Contratos')
@Controller('v1/contracts/:id')
@ApiPermissionErrors()
export class ContractFollowUpController {
  constructor(
    @Inject(ObligationsUseCase) private readonly obligations: ObligationsUseCase,
    @Inject(AmendmentsUseCase) private readonly amendments: AmendmentsUseCase,
    @Inject(ContractQueries) private readonly queries: ContractQueries,
  ) {}

  @RequirePermission('contract.update')
  @Post('obligations')
  @ApiOperation({
    summary: 'Registrar una obligación o un hito',
    description: 'Con su responsable y su fecha; el responsable recibe un aviso 7 días antes.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractCreatedResponse, description: 'Creada' })
  @ApiContractWriteErrors()
  async createObligation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: ObligationRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractCreatedResponse> {
    return { id: await this.obligations.create(principal, id, body, meta) };
  }

  @RequirePermission('contract.update')
  @Put('obligations/:obligationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar una obligación', description: 'Una cumplida ya no cambia.' })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiContractWriteErrors()
  async updateObligation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) contractId: string,
    @Param('obligationId', UUID) obligationId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ObligationRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { contractId, id: obligationId, version: versionFromIfMatch(ifMatch) };
    await this.obligations.update(principal, target, body, meta);
  }

  @RequirePermission('contract.update')
  @Post('obligations/:obligationId/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Marcar una obligación como cumplida',
    description: 'Con una nota opcional.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cumplida' })
  @ApiContractWriteErrors()
  async completeObligation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) contractId: string,
    @Param('obligationId', UUID) obligationId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompleteObligationRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { contractId, id: obligationId, version: versionFromIfMatch(ifMatch) };
    await this.obligations.complete(principal, target, body, meta);
  }

  @RequirePermission('contract.update')
  @Post('amendments')
  @ApiOperation({
    summary: 'Proponer un otrosí',
    description: 'Sobre un contrato vigente; la Dirección recibe la tarea de aprobarlo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractCreatedResponse, description: 'Creado' })
  @ApiContractWriteErrors()
  async createAmendment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: CreateAmendmentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractCreatedResponse> {
    return { id: await this.amendments.create(principal, id, body, meta) };
  }

  @RequirePermission('contract.renew')
  @Post('actions/renew')
  @ApiOperation({
    summary: 'Prorrogar (Dirección)',
    description:
      'Crea la prórroga aprobada con la nueva fecha de fin; rige al registrar la firmada.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractCreatedResponse, description: 'Creada' })
  @ApiContractWriteErrors()
  async renew(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: RenewContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractCreatedResponse> {
    return { id: await this.amendments.renew(principal, id, body, meta) };
  }

  @RequirePermission('contract.approve')
  @Post('amendments/:amendmentId/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar un otrosí (Dirección)',
    description: 'Quien lo elaboró no lo aprueba.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  @ApiContractWriteErrors()
  async approveAmendment(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) contractId: string,
    @Param('amendmentId', UUID) amendmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AmendmentDecisionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { contractId, id: amendmentId, version: versionFromIfMatch(ifMatch) };
    await this.amendments.approve({ principal, ability, meta }, target, body);
  }

  @RequirePermission('contract.approve')
  @Post('amendments/:amendmentId/actions/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Devolver un otrosí (Dirección)',
    description: 'No rige; se crea otro.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelto' })
  @ApiContractWriteErrors()
  async returnAmendment(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) contractId: string,
    @Param('amendmentId', UUID) amendmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AmendmentDecisionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { contractId, id: amendmentId, version: versionFromIfMatch(ifMatch) };
    await this.amendments.returnToAuthor({ principal, ability, meta }, target, body);
  }

  @RequirePermission('contract.update')
  @Post('amendments/:amendmentId/actions/register-signature')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar la firma de un otrosí',
    description:
      'Con la copia firmada, el otrosí rige y cambia la fecha de fin o el valor del contrato.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Firmado' })
  @ApiContractWriteErrors()
  async registerAmendmentSignature(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) contractId: string,
    @Param('amendmentId', UUID) amendmentId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: AmendmentSignatureRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { contractId, id: amendmentId, version: versionFromIfMatch(ifMatch) };
    await this.amendments.registerSignature(principal, target, body, meta);
  }

  @RequirePermission('contract.read')
  @Post('amendments/:amendmentId/pdf')
  @ApiOperation({
    summary: 'Enlace para descargar el PDF de un otrosí',
    description: 'El PDF aprobado o la copia firmada; enlace temporal que queda en la auditoría.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: AmendmentPdfLinkResponse,
    description: 'Enlace',
  })
  @ApiContractWriteErrors()
  async amendmentPdf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) contractId: string,
    @Param('amendmentId', UUID) amendmentId: string,
    @Body() body: AmendmentPdfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AmendmentPdfLinkResponse> {
    const target = { contractId, id: amendmentId };
    return this.queries.amendmentPdfLink(principal, ability, target, body.document, meta);
  }
}
