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
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  accessReviewResponseSchema,
  createDelegationRequestSchema,
  createdResponseSchema,
  delegationListResponseSchema,
  errorResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { AccessReviewQuery } from '../application/access-review.js';
import { DelegationsUseCase } from '../application/delegations.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class DelegationListResponse extends createZodDto(delegationListResponseSchema) {}
class CreateDelegationRequest extends createZodDto(createDelegationRequestSchema) {}
class DelegationCreatedResponse extends createZodDto(createdResponseSchema) {}
class AccessReviewResponse extends createZodDto(accessReviewResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/** Delegaciones de aprobaciones y revisión de accesos (B10, ficha 17.2). */
@ApiTags('Usuarios y roles')
@Controller('v1')
@ApiPermissionErrors()
export class DelegationsController {
  constructor(
    @Inject(DelegationsUseCase) private readonly delegations: DelegationsUseCase,
    @Inject(AccessReviewQuery) private readonly review: AccessReviewQuery,
  ) {}

  @RequirePermission('iam.delegation.manage')
  @Get('delegations')
  @ApiOperation({
    summary: 'Delegaciones de aprobaciones',
    description: 'Todas con el permiso completo; si no, las que usted hizo o recibió.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DelegationListResponse, description: 'Delegaciones' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<DelegationListResponse> {
    return { data: await this.delegations.list(principal, ability) };
  }

  @RequirePermission('iam.delegation.manage')
  @RecentAuthentication()
  @Post('delegations')
  @ApiOperation({
    summary: 'Delegar aprobaciones por un tiempo',
    description:
      'Hasta 60 días, solo aprobaciones que quien delega tiene. Exige confirmar la identidad.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: DelegationCreatedResponse,
    description: 'Creada',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Fechas, personas o permisos que no cumplen las reglas',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateDelegationRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DelegationCreatedResponse> {
    return { id: await this.delegations.create(principal, ability, body, meta) };
  }

  @RequirePermission('iam.delegation.manage')
  @Post('delegations/:id/actions/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar una delegación vigente o programada' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirada' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'No existe',
  })
  async revoke(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) delegationId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.delegations.revoke(principal, ability, delegationId, meta);
  }

  @RequirePermission('iam.access_review.read')
  @Get('access-review')
  @ApiOperation({
    summary: 'Informe de revisión de accesos',
    description:
      'Usuarios, roles, último ingreso y cuentas sin uso en 60 días. Queda en la auditoría.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: AccessReviewResponse, description: 'Informe' })
  async accessReview(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<AccessReviewResponse> {
    return this.review.execute(principal, meta);
  }

  @RequirePermission('iam.access_review.read')
  @Post('access-review/export')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Descargar el informe de revisión de accesos en CSV',
    description:
      'El mismo informe, separado por punto y coma para Excel. La descarga queda en la auditoría.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async exportAccessReview(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.review.export(principal, meta);
    response.attachment(file.fileName);
    return file.content;
  }
}
