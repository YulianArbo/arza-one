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
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createPrivacyRequestSchema,
  privacyExtensionSchema,
  privacyRequestListQuerySchema,
  privacyRequestListResponseSchema,
  privacyRequestSchema,
  privacyRequirementAnswerSchema,
  privacyRequirementSchema,
  privacyResponseSchema,
  verifyPrivacyRequestSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PrivacyReportsUseCase } from '../application/privacy-reports.js';
import { RequestStepsUseCase } from '../application/request-steps.js';
import { RequestsUseCase } from '../application/requests.js';
import { ApiIfMatch, ApiPrivacyErrors, PrivacyCreatedResponse } from './privacy-openapi.js';

class PrivacyRequestListQuery extends createZodDto(privacyRequestListQuerySchema) {}
class PrivacyRequestListResponse extends createZodDto(privacyRequestListResponseSchema) {}
class PrivacyRequestResponse extends createZodDto(privacyRequestSchema) {}
class CreatePrivacyRequestBody extends createZodDto(createPrivacyRequestSchema) {}
class VerifyPrivacyRequestBody extends createZodDto(verifyPrivacyRequestSchema) {}
class PrivacyRequirementBody extends createZodDto(privacyRequirementSchema) {}
class PrivacyRequirementAnswerBody extends createZodDto(privacyRequirementAnswerSchema) {}
class PrivacyExtensionBody extends createZodDto(privacyExtensionSchema) {}
class PrivacyResponseBody extends createZodDto(privacyResponseSchema) {}

const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

/**
 * Solicitudes de titulares para el Oficial de Protección de Datos (M18, B42; ficha 17.19):
 * Privacidad › Solicitudes de titulares. Cada paso va con la versión que se vio en If-Match.
 */
@ApiTags('Privacidad')
@Controller('v1/privacy-requests')
@RequirePermission('privacy.request.manage')
@ApiPermissionErrors()
export class PrivacyRequestsController {
  constructor(
    @Inject(RequestsUseCase) private readonly requests: RequestsUseCase,
    @Inject(RequestStepsUseCase) private readonly steps: RequestStepsUseCase,
    @Inject(PrivacyReportsUseCase) private readonly reports: PrivacyReportsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de titulares, de la más nueva a la más vieja' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PrivacyRequestListResponse,
    description: 'Solicitudes',
  })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: PrivacyRequestListQuery,
  ): Promise<PrivacyRequestListResponse> {
    return this.requests.list(principal, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar una solicitud que llegó por correo, teléfono, en persona o por escrito',
    description: 'Recibe su código y la fecha límite legal; el Oficial recibe la tarea.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PrivacyCreatedResponse,
    description: 'Registrada',
  })
  @ApiPrivacyErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreatePrivacyRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.requests.create(principal, body, meta) };
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Descargar el registro de solicitudes en CSV',
    description: 'Separado por punto y coma para Excel. Queda en la auditoría.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async exportRegister(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.reports.requestsCsv(principal, meta);
    response.attachment(file.fileName);
    return file.content;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una solicitud con su historia' })
  @ZodResponse({ status: HttpStatus.OK, type: PrivacyRequestResponse, description: 'Solicitud' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PrivacyRequestResponse> {
    return this.requests.get(principal, id);
  }

  @Post(':id/actions/start-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Empezar a verificar la identidad del titular' })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async startVerification(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.startVerification(principal, id, versionFromIfMatch(ifMatch), meta);
  }

  @Post(':id/actions/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar la identidad verificada',
    description: 'Relaciona la solicitud con el titular en Terceros y dice cómo se comprobó.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async verify(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: VerifyPrivacyRequestBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.verify(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @Post(':id/actions/require')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pedir que complete el reclamo',
    description: 'Dentro de los 5 días hábiles siguientes; el plazo queda suspendido.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async require(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyRequirementBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.require(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @Post(':id/actions/answer-requirement')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar que el titular completó el reclamo',
    description: 'El plazo vuelve a correr desde ese día.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async answerRequirement(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyRequirementAnswerBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.answerRequirement(principal, target, body, meta);
  }

  @Post(':id/actions/extend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Ampliar el plazo',
    description:
      'Una sola vez y antes del vencimiento: 5 días hábiles las consultas, 8 los reclamos.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async extend(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyExtensionBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.extend(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @Post(':id/actions/respond')
  @RequirePermission('privacy.request.respond')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Responder al titular',
    description: 'La respuesta le llega por correo.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async respond(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PrivacyResponseBody,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.respond(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @Post(':id/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar la solicitud respondida',
    description: 'Cierra la tarea del Oficial.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiPrivacyErrors()
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.close(principal, id, versionFromIfMatch(ifMatch), meta);
  }
}
