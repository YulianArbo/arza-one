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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  approveContractRequestSchema,
  contractDetailSchema,
  contractListQuerySchema,
  contractListResponseSchema,
  contractOptionsQuerySchema,
  contractOptionsSchema,
  contractPdfRequestSchema,
  createContractRequestSchema,
  downloadLinkResponseSchema,
  registerSignatureRequestSchema,
  returnContractRequestSchema,
  terminateContractRequestSchema,
  updateContractRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ContractQueries } from '../application/contract-queries.js';
import { ContractsUseCase } from '../application/contracts.js';
import {
  ApiContractIfMatch,
  ApiContractWriteErrors,
  ContractCreatedResponse,
} from './contract-openapi.js';

class ContractListQuery extends createZodDto(contractListQuerySchema) {}
class ContractListResponse extends createZodDto(contractListResponseSchema) {}
class ContractDetailResponse extends createZodDto(contractDetailSchema) {}
class ContractOptionsQuery extends createZodDto(contractOptionsQuerySchema) {}
class ContractOptionsResponse extends createZodDto(contractOptionsSchema) {}
class ContractPdfRequest extends createZodDto(contractPdfRequestSchema) {}
class ContractPdfLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class CreateContractRequest extends createZodDto(createContractRequestSchema) {}
class UpdateContractRequest extends createZodDto(updateContractRequestSchema) {}
class ApproveContractRequest extends createZodDto(approveContractRequestSchema) {}
class ReturnContractRequest extends createZodDto(returnContractRequestSchema) {}
class RegisterSignatureRequest extends createZodDto(registerSignatureRequestSchema) {}
class TerminateContractRequest extends createZodDto(terminateContractRequestSchema) {}

/** Contratos y órdenes de servicio (M06, B24; ficha 17.7). */
@ApiTags('Contratos')
@Controller('v1/contracts')
@ApiPermissionErrors()
export class ContractsController {
  constructor(
    @Inject(ContractQueries) private readonly queries: ContractQueries,
    @Inject(ContractsUseCase) private readonly contracts: ContractsUseCase,
  ) {}

  @RequirePermission('contract.read')
  @Get()
  @ApiOperation({
    summary: 'Contratos',
    description:
      'Los más recientes primero. Quien solo ve lo propio ve aquellos de los que es responsable o autor.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ContractListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: ContractListQuery,
  ): Promise<ContractListResponse> {
    return this.queries.list(principal, ability, query);
  }

  @RequirePermission('contract.create')
  @Get('options')
  @ApiOperation({
    summary: 'Opciones del asistente',
    description:
      'Plantillas activas, quién firma por el cliente y la cotización aceptada de origen.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ContractOptionsResponse, description: 'Opciones' })
  async options(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ContractOptionsQuery,
  ): Promise<ContractOptionsResponse> {
    return this.queries.options(principal, query);
  }

  @RequirePermission('contract.create')
  @Post()
  @ApiOperation({
    summary: 'Generar un contrato en borrador',
    description:
      'Desde una plantilla CT-COM u OS-COM con los datos del cliente y, si la hay, de la cotización aceptada. Código CTR-AAAA-NNNN u OS-AAAA-NNNN.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractCreatedResponse, description: 'Creado' })
  @ApiContractWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractCreatedResponse> {
    return { id: await this.contracts.create(principal, body, meta) };
  }

  @RequirePermission('contract.read')
  @Get(':id')
  @ApiOperation({
    summary: 'Ficha del contrato',
    description: 'El expediente contractual: el texto, las obligaciones, los otrosíes y los PDF.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ContractDetailResponse, description: 'Ficha' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No existe' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ContractDetailResponse> {
    return this.queries.detail(principal, ability, id);
  }

  @RequirePermission('contract.update')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Guardar el borrador',
    description:
      'Los datos y las cláusulas juntos. Una cláusula cambiada queda marcada como modificada.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiContractWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.contracts.update(
      principal,
      { id, version: versionFromIfMatch(ifMatch) },
      body,
      meta,
    );
  }

  @RequirePermission('contract.update')
  @Post(':id/actions/submit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Pedir la revisión',
    description: 'La Dirección recibe en Mis tareas la tarea de aprobarlo.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En revisión' })
  @ApiContractWriteErrors()
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.contracts.submit(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('contract.approve')
  @Post(':id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar (Dirección)',
    description:
      'Exige marcar como revisadas, una por una, las cláusulas modificadas o nuevas. Quien lo elaboró no lo aprueba.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  @ApiContractWriteErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ApproveContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.contracts.approve({ principal, ability, meta }, target, body);
  }

  @RequirePermission('contract.approve')
  @Post(':id/actions/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Devolver para corregir (Dirección)',
    description: 'Vuelve a borrador con el comentario. Quien lo elaboró no lo devuelve.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelto' })
  @ApiContractWriteErrors()
  async returnToDraft(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReturnContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.contracts.returnToDraft({ principal, ability, meta }, target, body);
  }

  @RequirePermission('contract.update')
  @Post(':id/actions/register-signature')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Registrar la firma manuscrita',
    description:
      'Sube la copia del PDF aprobado firmada por todos; el contrato queda vigente. La firma electrónica llega con el B25.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Vigente' })
  @ApiContractWriteErrors()
  async registerSignature(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RegisterSignatureRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.contracts.registerSignature(principal, target, body, meta);
  }

  @RequirePermission('contract.terminate')
  @Post(':id/actions/terminate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Terminar (Dirección)',
    description: 'Terminación anticipada de un contrato vigente, con su fecha y su motivo.',
  })
  @ApiContractIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Terminado' })
  @ApiContractWriteErrors()
  async terminate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: TerminateContractRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.contracts.terminate(
      principal,
      { id, version: versionFromIfMatch(ifMatch) },
      body,
      meta,
    );
  }

  @RequirePermission('contract.read')
  @Post(':id/pdf')
  @ApiOperation({
    summary: 'Enlace para descargar el PDF',
    description: 'El PDF aprobado o la copia firmada; enlace temporal que queda en la auditoría.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ContractPdfLinkResponse, description: 'Enlace' })
  @ApiContractWriteErrors()
  async pdf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ContractPdfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ContractPdfLinkResponse> {
    return this.queries.pdfLink(principal, ability, id, body.document, meta);
  }
}
