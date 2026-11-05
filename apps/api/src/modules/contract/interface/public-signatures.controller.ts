import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  errorResponseSchema,
  publicRejectRequestSchema,
  publicSignRequestSchema,
  publicSignatureDocumentRequestSchema,
  publicSignatureRequestSchema,
  publicSignatureSchema,
  verifyDocumentRequestSchema,
  verifyDocumentResponseSchema,
  verifySignatureCodeRequestSchema,
  verifySignatureCodeResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { PublicSignaturesUseCase } from '../application/signature-public.js';
import { SignatureVerificationUseCase } from '../application/signature-verification.js';

class PublicSignatureRequest extends createZodDto(publicSignatureRequestSchema) {}
class PublicSignatureResponse extends createZodDto(publicSignatureSchema) {}
class VerifySignatureCodeRequest extends createZodDto(verifySignatureCodeRequestSchema) {}
class VerifySignatureCodeResponse extends createZodDto(verifySignatureCodeResponseSchema) {}
class PublicSignatureDocumentRequest extends createZodDto(publicSignatureDocumentRequestSchema) {}
class PublicSignRequest extends createZodDto(publicSignRequestSchema) {}
class PublicRejectRequest extends createZodDto(publicRejectRequestSchema) {}
class VerifyDocumentRequest extends createZodDto(verifyDocumentRequestSchema) {}
class VerifyDocumentResponse extends createZodDto(verifyDocumentResponseSchema) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PublicSignatureErrorResponse extends createZodDto(errorResponseSchema) {}

/** Pocas peticiones por minuto: ni la llave ni el código se adivinan probando. */
const LINK_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

const LINK_NOT_VALID = {
  status: HttpStatus.NOT_FOUND,
  type: PublicSignatureErrorResponse.Output,
  description: 'El enlace no existe, venció o se reemplazó por uno más reciente',
};

const NOT_ALLOWED = {
  status: HttpStatus.CONFLICT,
  type: PublicSignatureErrorResponse.Output,
  description: 'No es su turno, ya firmó o el proceso se cerró',
};

/**
 * La página de firma (B25, numeral 19.2): quien firma por el cliente abre el enlace de su correo, sin
 * sesión. La llave va en el cuerpo de la petición, nunca en la dirección: así no queda en los
 * registros.
 */
@ApiTags('Firma electrónica: página de firma')
@Controller('v1/public/signatures')
@Public()
@Throttle(LINK_THROTTLE)
@ApiCommonErrors()
export class PublicSignaturesController {
  constructor(
    @Inject(PublicSignaturesUseCase) private readonly signatures: PublicSignaturesUseCase,
  ) {}

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Abrir el enlace',
    description: 'El documento, quien firma y su estado. Queda en la cadena que lo abrió.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PublicSignatureResponse, description: 'Proceso' })
  @ApiResponse(LINK_NOT_VALID)
  async open(
    @Body() body: PublicSignatureRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PublicSignatureResponse> {
    return this.signatures.open(body.token, meta);
  }

  @Post('code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pedir el código',
    description: 'Seis números al correo registrado, válidos diez minutos. Uno por minuto.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Pedido' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse(NOT_ALLOWED)
  async requestCode(
    @Body() body: PublicSignatureRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.signatures.requestCode(body.token, meta);
  }

  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar el código',
    description:
      'Entrega la confirmación para leer y firmar. Al quinto código equivocado, el enlace se bloquea.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: VerifySignatureCodeResponse, description: 'Válido' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: PublicSignatureErrorResponse.Output,
    description: 'Código equivocado o vencido',
  })
  async verifyCode(
    @Body() body: VerifySignatureCodeRequest,
    @Meta() meta: RequestMeta,
  ): Promise<VerifySignatureCodeResponse> {
    return this.signatures.verifyCode(body, meta);
  }

  @Post('document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'El PDF',
    description:
      'El documento por firmar, con el código validado, o el firmado por todos, durante 30 días.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: HttpStatus.OK, description: 'El PDF' })
  @ApiResponse(LINK_NOT_VALID)
  async document(
    @Body() body: PublicSignatureDocumentRequest,
    @Res({ passthrough: true }) response: Response,
    @Meta() meta: RequestMeta,
  ): Promise<StreamableFile> {
    const file = await this.signatures.document(body, meta);
    if (body.disposition === 'attachment') response.attachment(file.fileName);
    return new StreamableFile(file.content, { type: file.mimeType, length: file.sizeBytes });
  }

  @Post('sign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Firmar',
    description:
      'Queda la evidencia: fecha y hora del servidor, IP, navegador, huella del documento y el texto aceptado.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Firmado' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse(NOT_ALLOWED)
  async sign(@Body() body: PublicSignRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.signatures.sign(body, meta);
  }

  @Post('reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechazar', description: 'Con el motivo; el proceso se cierra.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazado' })
  @ApiResponse(LINK_NOT_VALID)
  @ApiResponse(NOT_ALLOWED)
  async reject(@Body() body: PublicRejectRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.signatures.reject(body, meta);
  }
}

/**
 * Verificación pública (B25, numeral 19.3): con el código o con la huella del archivo, calculada en el
 * computador de quien consulta. No revela el contenido ni los nombres.
 */
@ApiTags('Firma electrónica: verificación pública')
@Controller('v1/public/verifications')
@Public()
@Throttle(LINK_THROTTLE)
@ApiCommonErrors()
export class PublicVerificationsController {
  constructor(
    @Inject(SignatureVerificationUseCase)
    private readonly verification: SignatureVerificationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar un documento firmado',
    description: 'Dice si coincide con el original firmado, sin revelar su contenido.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: VerifyDocumentResponse, description: 'Resultado' })
  async verify(
    @Body() body: VerifyDocumentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<VerifyDocumentResponse> {
    return this.verification.verify(body, meta);
  }
}
