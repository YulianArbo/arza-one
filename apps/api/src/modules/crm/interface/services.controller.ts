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
  serviceListQuerySchema,
  serviceListResponseSchema,
  serviceRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ServicesUseCase } from '../application/services.js';
import { ApiCrmIfMatch, ApiCrmWriteErrors, CrmCreatedResponse } from './crm-openapi.js';

class ServiceListQuery extends createZodDto(serviceListQuerySchema) {}
class ServiceListResponse extends createZodDto(serviceListResponseSchema) {}
class ServiceRequest extends createZodDto(serviceRequestSchema) {}

/** Portafolio de servicios con sus tarifas (M05, B23). Lo ve quien ve cotizaciones. */
@ApiTags('Comercial')
@Controller('v1/crm/services')
@ApiPermissionErrors()
export class ServicesController {
  constructor(@Inject(ServicesUseCase) private readonly services: ServicesUseCase) {}

  @RequirePermission('crm.quote.read')
  @Get()
  @ApiOperation({ summary: 'Servicios del portafolio', description: 'Activos o todos.' })
  @ZodResponse({ status: HttpStatus.OK, type: ServiceListResponse, description: 'Servicios' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: ServiceListQuery,
  ): Promise<ServiceListResponse> {
    return this.services.list(principal, query);
  }

  @RequirePermission('crm.service.manage')
  @Post()
  @ApiOperation({ summary: 'Agregar un servicio al portafolio', description: 'Código SRV-NNNN.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CrmCreatedResponse, description: 'Agregado' })
  @ApiCrmWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ServiceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<CrmCreatedResponse> {
    return { id: await this.services.create(principal, body, meta) };
  }

  @RequirePermission('crm.service.manage')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar o desactivar un servicio',
    description: 'Las cotizaciones que ya lo usan conservan sus valores.',
  })
  @ApiCrmIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiCrmWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ServiceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.services.update(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }
}
