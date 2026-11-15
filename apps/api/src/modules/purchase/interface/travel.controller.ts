import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addTravelExpenseSchema,
  rejectTravelSchema,
  saveTravelRequestSchema,
  travelRequestListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TravelUseCase } from '../application/travel.js';
import {
  CONFLICT,
  IF_MATCH,
  INVALID,
  NOT_FOUND,
  PurCreatedResponse,
  UUID,
} from './purchase-http.js';

class TravelListResponse extends createZodDto(travelRequestListResponseSchema) {}
class SaveTravel extends createZodDto(saveTravelRequestSchema) {}
class RejectTravel extends createZodDto(rejectTravelSchema) {}
class AddExpense extends createZodDto(addTravelExpenseSchema) {}

/** Solicitud y aprobación de viajes. */
@ApiTags('Compras')
@Controller('v1/travel-requests')
@ApiPermissionErrors()
export class TravelRequestsController {
  constructor(@Inject(TravelUseCase) private readonly travel: TravelUseCase) {}

  @RequirePermission('purchase.read')
  @Get()
  @ApiOperation({ summary: 'Viajes de la empresa con su legalización' })
  @ZodResponse({ status: HttpStatus.OK, type: TravelListResponse, description: 'Viajes' })
  async list(@CurrentPrincipal() principal: Principal): Promise<TravelListResponse> {
    return { data: await this.travel.list(principal) };
  }

  @RequirePermission('purchase.travel.request')
  @Get('mine')
  @ApiOperation({ summary: 'Viajes de la persona' })
  @ZodResponse({ status: HttpStatus.OK, type: TravelListResponse, description: 'Mis viajes' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<TravelListResponse> {
    return { data: await this.travel.mine(principal) };
  }

  @RequirePermission('purchase.travel.request')
  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Crear una solicitud de viaje, en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Viaje' })
  @ApiResponse(INVALID)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: SaveTravel,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    return { id: await this.travel.create({ principal, meta }, idempotencyKeyFrom(header), body) };
  }

  @RequirePermission('purchase.travel.request')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Editar un viaje propio en borrador' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SaveTravel,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.update({ principal, meta }, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('purchase.travel.request')
  @Post(':id/submission')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Enviar un viaje propio a aprobación' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Enviado' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.submit({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('purchase.travel.approve')
  @Post(':id/approval')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar un viaje (otra persona que el viajero)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.approve({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('purchase.travel.approve')
  @Post(':id/rejection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Rechazar un viaje con su motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazado' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectTravel,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.reject({ principal, meta }, id, versionFromIfMatch(ifMatch), body.reason);
  }
}

/** Legalización de un viaje aprobado: gastos con soporte y cierre. */
@ApiTags('Compras')
@Controller('v1')
@ApiPermissionErrors()
export class TravelLegalizationController {
  constructor(@Inject(TravelUseCase) private readonly travel: TravelUseCase) {}

  @RequirePermission('purchase.travel.request')
  @Post('travel-requests/:id/expenses')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar un gasto del viaje con su soporte' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PurCreatedResponse, description: 'Gasto' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async addExpense(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: AddExpense,
    @Meta() meta: RequestMeta,
  ): Promise<PurCreatedResponse> {
    const key = idempotencyKeyFrom(header);
    return { id: await this.travel.addExpense({ principal, meta }, id, key, body) };
  }

  @RequirePermission('purchase.travel.request')
  @Delete('travel-expenses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un gasto de un viaje aún sin legalizar' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Quitado' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async removeExpense(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.removeExpense({ principal, meta }, id);
  }

  @RequirePermission('purchase.travel.request')
  @Post('travel-requests/:id/legalization')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Legalizar un viaje propio con sus gastos' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Legalizado' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async legalize(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.travel.legalize({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }
}
