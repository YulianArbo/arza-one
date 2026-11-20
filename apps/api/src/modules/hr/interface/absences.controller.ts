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
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  decideLeaveSchema,
  hrCreatedResponseSchema,
  leaveListQuerySchema,
  leaveRequestListResponseSchema,
  leaveTypeListResponseSchema,
  registerLeaveSchema,
  rejectLeaveSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { LeaveDecisions } from '../application/leave-decisions.js';
import { LeaveRequests } from '../application/leave-requests.js';

class LeaveListResponse extends createZodDto(leaveRequestListResponseSchema) {}
class LeaveTypeListResponse extends createZodDto(leaveTypeListResponseSchema) {}
class LeaveListQuery extends createZodDto(leaveListQuerySchema) {}
class RegisterLeaveBody extends createZodDto(registerLeaveSchema) {}
class DecideLeaveBody extends createZodDto(decideLeaveSchema) {}
class RejectLeaveBody extends createZodDto(rejectLeaveSchema) {}
class LeaveCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión de la solicitud' };

// Permisos, licencias y vacaciones (B36). Decidir lo puede el jefe inmediato designado aunque solo
// tenga el rol de colaborador: la ruta exige ver colaboradores y el caso de uso revisa que le
// corresponda (numeral 15.4, ABAC); si no, responde 403.

@ApiTags('Talento Humano')
@Controller('v1/hr')
@ApiPermissionErrors()
export class AbsencesController {
  constructor(
    @Inject(LeaveRequests) private readonly requests: LeaveRequests,
    @Inject(LeaveDecisions) private readonly decisions: LeaveDecisions,
  ) {}

  @Get('leave-types')
  @RequirePermission('hr.employee.read')
  @ApiOperation({ summary: 'Consultar los tipos de ausencia' })
  @ZodResponse({ status: HttpStatus.OK, type: LeaveTypeListResponse, description: 'Tipos' })
  async types(@CurrentPrincipal() principal: Principal): Promise<LeaveTypeListResponse> {
    return { data: await this.requests.types(principal) };
  }

  @Get('leave-requests')
  @RequirePermission('hr.leave.approve')
  @ApiOperation({ summary: 'Consultar las ausencias de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: LeaveListResponse, description: 'Ausencias' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: LeaveListQuery,
  ): Promise<LeaveListResponse> {
    return { data: await this.decisions.all({ principal, ability }, query.status) };
  }

  @Post('leave-requests')
  @RequirePermission('hr.employee.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar una ausencia a nombre de un colaborador (Talento humano)' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: LeaveCreatedResponse,
    description: 'Registrada',
  })
  async register(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RegisterLeaveBody,
  ): Promise<LeaveCreatedResponse> {
    return { id: await this.requests.register(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post('leave-requests/:id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.read')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar una solicitud de ausencia (jefe inmediato o Talento humano)' })
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: DecideLeaveBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.decide({ principal, ability }, meta, target, {
      approve: true,
      note: input.note,
    });
  }

  @Post('leave-requests/:id/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.read')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Rechazar una solicitud de ausencia con su motivo' })
  async reject(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: RejectLeaveBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.decide({ principal, ability }, meta, target, {
      approve: false,
      note: input.note,
    });
  }
}
