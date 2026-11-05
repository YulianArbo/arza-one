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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  cancelEnvelopeRequestSchema,
  createEnvelopeRequestSchema,
  downloadLinkResponseSchema,
  envelopeDocumentRequestSchema,
  envelopeListQuerySchema,
  envelopeListResponseSchema,
  envelopeOptionsQuerySchema,
  envelopeOptionsSchema,
  rejectSignatureRequestSchema,
  sendEnvelopeRequestSchema,
  signAsCompanyRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { SignaturesUseCase } from '../application/signatures.js';
import {
  ApiContractIfMatch,
  ApiContractWriteErrors,
  ContractCreatedResponse,
} from './contract-openapi.js';

class EnvelopeOptionsQuery extends createZodDto(envelopeOptionsQuerySchema) {}
class EnvelopeOptionsResponse extends createZodDto(envelopeOptionsSchema) {}
class EnvelopeListQuery extends createZodDto(envelopeListQuerySchema) {}
class EnvelopeListResponse extends createZodDto(envelopeListResponseSchema) {}
class CreateEnvelopeRequest extends createZodDto(createEnvelopeRequestSchema) {}
class SendEnvelopeRequest extends createZodDto(sendEnvelopeRequestSchema) {}
class CancelEnvelopeRequest extends createZodDto(cancelEnvelopeRequestSchema) {}
class SignAsCompanyRequest extends createZodDto(signAsCompanyRequestSchema) {}
class RejectSignatureRequest extends createZodDto(rejectSignatureRequestSchema) {}
class EnvelopeDocumentRequest extends createZodDto(envelopeDocumentRequestSchema) {}
class EnvelopeDocumentLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

/** Firma electrónica de contratos y otrosíes (M06, B25; capítulo 19). */
@ApiTags('Firma electrónica')
@Controller('v1/signature-envelopes')
@ApiPermissionErrors()
export class SignaturesController {
  constructor(@Inject(SignaturesUseCase) private readonly signatures: SignaturesUseCase) {}

  @RequirePermission('signature.envelope.create')
  @Get('options')
  @ApiOperation({
    summary: 'Opciones para preparar el envío',
    description:
      'Firmantes autorizados del cliente, quién puede firmar por la empresa, si el conocimiento del cliente está aprobado y el plazo.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: EnvelopeOptionsResponse, description: 'Opciones' })
  async options(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: EnvelopeOptionsQuery,
  ): Promise<EnvelopeOptionsResponse> {
    return this.signatures.options(principal, ability, query);
  }

  @RequirePermission('contract.read')
  @Get()
  @ApiOperation({
    summary: 'Procesos de firma de un documento',
    description:
      'Los más recientes primero, con sus firmantes y su cadena de eventos. La IP y el navegador solo los ve quien puede ver las evidencias.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: EnvelopeListResponse, description: 'Procesos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: EnvelopeListQuery,
  ): Promise<EnvelopeListResponse> {
    return this.signatures.list(principal, ability, query);
  }

  @RequirePermission('signature.envelope.create')
  @Post()
  @ApiOperation({
    summary: 'Preparar el envío a firma',
    description:
      'De un contrato o un otrosí aprobado: firmantes del cliente en orden y, de último, la Dirección. Código FE-AAAA-NNNN.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractCreatedResponse, description: 'Creado' })
  @ApiContractWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateEnvelopeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractCreatedResponse> {
    return { id: await this.signatures.create({ principal, ability, meta }, body) };
  }

  @RequirePermission('signature.envelope.send')
  @Post(':id/actions/send')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Enviar a firma',
    description:
      'El documento queda «en firma» y el primer firmante recibe su enlace. Repetirlo con la misma llave no lo repite.',
  })
  @ApiContractIfMatch()
  @ApiIdempotencyKey()
  @ApiResponse(DONE)
  @ApiContractWriteErrors()
  async send(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _body: SendEnvelopeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const key = idempotencyKeyFrom(idempotencyKey);
    const version = versionFromIfMatch(ifMatch);
    await this.signatures.send({ principal, ability, meta }, { id, version, key });
  }

  @RequirePermission('signature.envelope.cancel')
  @Post(':id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Anular el proceso',
    description: 'Los enlaces dejan de servir y el documento vuelve a «aprobado».',
  })
  @ApiResponse(DONE)
  @ApiContractWriteErrors()
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelEnvelopeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.signatures.cancel({ principal, ability, meta }, id, body);
  }

  @RequirePermission('signature.envelope.send')
  @Post(':id/signers/:signerId/actions/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reenviar el enlace',
    description:
      'A quien le toca firmar: un enlace nuevo (el anterior deja de servir). Desbloquea el código si se bloqueó.',
  })
  @ApiResponse(DONE)
  @ApiContractWriteErrors()
  async resend(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('signerId', new ParseUUIDPipe()) signerId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.signatures.resend({ principal, ability, meta }, id, signerId);
  }

  @RequirePermission('contract.read')
  @RecentAuthentication()
  @Post(':id/actions/sign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Firmar por la empresa',
    description:
      'Solo la persona elegida, cuando le toca. Exige confirmar la identidad (contraseña y segundo factor).',
  })
  @ApiResponse(DONE)
  @ApiContractWriteErrors()
  async sign(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() _body: SignAsCompanyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.signatures.signAsCompany({ principal, ability, meta }, id);
  }

  @RequirePermission('contract.read')
  @RecentAuthentication()
  @Post(':id/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Rechazar por la empresa',
    description: 'Cierra el proceso; el documento vuelve a «aprobado».',
  })
  @ApiResponse(DONE)
  @ApiContractWriteErrors()
  async reject(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectSignatureRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.signatures.rejectAsCompany({ principal, ability, meta }, id, body);
  }

  @RequirePermission('signature.evidence.read')
  @Post(':id/documents')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Descargar un PDF del proceso',
    description: 'El enviado a firma, el firmado o el certificado de evidencia.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: EnvelopeDocumentLinkResponse, description: 'Enlace' })
  @ApiContractWriteErrors()
  async document(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EnvelopeDocumentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<EnvelopeDocumentLinkResponse> {
    return this.signatures.documentLink({ principal, ability, meta }, id, body.document);
  }
}
