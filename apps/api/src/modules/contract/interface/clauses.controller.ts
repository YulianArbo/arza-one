import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  clauseKeySchema,
  clauseListSchema,
  clauseVersionRequestSchema,
  createClauseRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ClauseLibraryUseCase } from '../application/clause-library.js';
import { ApiContractWriteErrors } from './contract-openapi.js';

class ClauseListResponse extends createZodDto(clauseListSchema) {}
class CreateClauseRequest extends createZodDto(createClauseRequestSchema) {}
class ClauseVersionRequest extends createZodDto(clauseVersionRequestSchema) {}
class ClauseKeyParams extends createZodDto(z.strictObject({ key: clauseKeySchema })) {}

/** Biblioteca de cláusulas aprobadas (M06, B24; ficha 17.7). */
@ApiTags('Contratos')
@Controller('v1/contract-clauses')
@ApiPermissionErrors()
export class ClausesController {
  constructor(@Inject(ClauseLibraryUseCase) private readonly library: ClauseLibraryUseCase) {}

  @RequirePermission('contract.read')
  @Get()
  @ApiOperation({
    summary: 'Biblioteca de cláusulas',
    description: 'La versión vigente de cada cláusula y las plantillas que la usan.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ClauseListResponse, description: 'Lista' })
  async list(@CurrentPrincipal() principal: Principal): Promise<ClauseListResponse> {
    return this.library.list(principal);
  }

  @RequirePermission('contract.clause.manage')
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Agregar una cláusula (Dirección)',
    description: 'Queda aprobada por quien la agrega. Solo admite las variables de la lista.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Agregada' })
  @ApiContractWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateClauseRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.library.create(principal, body, meta);
  }

  @RequirePermission('contract.clause.manage')
  @Post(':key/versions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Crear la versión siguiente de una cláusula (Dirección)',
    description:
      'La anterior se conserva: los contratos aprobados mantienen la versión que usaron.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Creada' })
  @ApiContractWriteErrors()
  async newVersion(
    @CurrentPrincipal() principal: Principal,
    @Param() params: ClauseKeyParams,
    @Body() body: ClauseVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.library.newVersion(principal, params.key, body, meta);
  }
}
