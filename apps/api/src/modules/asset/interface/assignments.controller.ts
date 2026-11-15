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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  assetAssigneeListResponseSchema,
  assetMaintenanceListResponseSchema,
  assignAssetSchema,
  cancelAssignmentSchema,
  completeMaintenanceSchema,
  returnAssetSchema,
  scheduleMaintenanceSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { astActorOf } from '../application/asset-support.js';
import { AssignmentsUseCase } from '../application/assignments.js';
import { MaintenanceUseCase } from '../application/maintenance.js';
import { AstCreatedResponse, CONFLICT, IF_MATCH, INVALID, NOT_FOUND, UUID } from './asset-http.js';
import { viewerOf } from './assets.controller.js';

class AssigneeListResponse extends createZodDto(assetAssigneeListResponseSchema) {}
class AssignAsset extends createZodDto(assignAssetSchema) {}
class CancelAssignment extends createZodDto(cancelAssignmentSchema) {}
class ReturnAsset extends createZodDto(returnAssetSchema) {}
class MaintenanceListResponse extends createZodDto(assetMaintenanceListResponseSchema) {}
class ScheduleMaintenance extends createZodDto(scheduleMaintenanceSchema) {}
class CompleteMaintenance extends createZodDto(completeMaintenanceSchema) {}

/** Asignación de activos en comodato: asignar, anular antes de la firma y devolver. */
@ApiTags('Activos')
@Controller('v1')
@ApiPermissionErrors()
export class AssetAssignmentsController {
  constructor(
    @Inject(AssignmentsUseCase) private readonly assignments: AssignmentsUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @RequirePermission('asset.assign')
  @Get('asset-assignees')
  @ApiOperation({ summary: 'Colaboradores a quienes se puede asignar un activo' })
  @ZodResponse({ status: HttpStatus.OK, type: AssigneeListResponse, description: 'Colaboradores' })
  async assignees(@CurrentPrincipal() principal: Principal): Promise<AssigneeListResponse> {
    return { data: await this.assignments.assignees(principal) };
  }

  @RequirePermission('asset.assign')
  @Post('assets/:id/assignments')
  @ApiIdempotencyKey()
  @ApiOperation({
    summary: 'Asignar un activo disponible; su contrato de comodato sale a firma del colaborador',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: AstCreatedResponse, description: 'Asignación' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: AssignAsset,
    @Meta() meta: RequestMeta,
  ): Promise<AstCreatedResponse> {
    const actor = astActorOf(principal, meta, this.clock.now());
    return { id: await this.assignments.assign(actor, id, idempotencyKeyFrom(header), body) };
  }

  @RequirePermission('asset.assign')
  @Post('asset-assignments/:id/cancellation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Anular una asignación que aún no se ha firmado' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Anulada' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CancelAssignment,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const actor = astActorOf(principal, meta, this.clock.now());
    await this.assignments.cancel(actor, id, versionFromIfMatch(ifMatch), body.reason);
  }

  @RequirePermission('asset.assign')
  @Post('asset-assignments/:id/return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar la devolución de un activo asignado' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelto' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async giveBack(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReturnAsset,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const actor = astActorOf(principal, meta, this.clock.now());
    await this.assignments.giveBack(actor, id, versionFromIfMatch(ifMatch), body);
  }
}

/** Mantenimientos de los activos: programar, registrar como hecho y quitar. */
@ApiTags('Activos')
@Controller('v1')
@ApiPermissionErrors()
export class AssetMaintenanceController {
  constructor(
    @Inject(MaintenanceUseCase) private readonly maintenance: MaintenanceUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @RequirePermission('asset.read')
  @Get('asset-maintenance')
  @ApiOperation({
    summary: 'Mantenimientos programados y hechos; con «solo lo propio», los de sus activos',
  })
  @ZodResponse({ status: HttpStatus.OK, type: MaintenanceListResponse, description: 'Lista' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<MaintenanceListResponse> {
    return { data: await this.maintenance.list(viewerOf(principal, ability)) };
  }

  @RequirePermission('asset.manage')
  @Post('assets/:id/maintenance')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Programar un mantenimiento a un activo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: AstCreatedResponse, description: 'Programado' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async schedule(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: ScheduleMaintenance,
    @Meta() meta: RequestMeta,
  ): Promise<AstCreatedResponse> {
    const actor = astActorOf(principal, meta, this.clock.now());
    return { id: await this.maintenance.schedule(actor, id, idempotencyKeyFrom(header), body) };
  }

  @RequirePermission('asset.manage')
  @Post('asset-maintenance/:id/completion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar un mantenimiento como hecho, con su fecha y su costo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Registrado' })
  @ApiResponse(INVALID)
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async complete(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: CompleteMaintenance,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const actor = astActorOf(principal, meta, this.clock.now());
    await this.maintenance.complete(actor, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('asset.manage')
  @Delete('asset-maintenance/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un mantenimiento programado que aún no se ha hecho' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Quitado' })
  @ApiResponse(CONFLICT)
  @ApiResponse(NOT_FOUND)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.maintenance.remove(astActorOf(principal, meta, this.clock.now()), id);
  }
}
