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
  overtimeListQuerySchema,
  overtimeListResponseSchema,
  rejectLeaveSchema,
  reportOvertimeSchema,
  requestOvertimeSchema,
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
import { OvertimeDecisions } from '../application/overtime-decisions.js';
import { OvertimeRequests } from '../application/overtime-requests.js';

class OvertimeListResponse extends createZodDto(overtimeListResponseSchema) {}
class OvertimeListQuery extends createZodDto(overtimeListQuerySchema) {}
class RequestOvertimeBody extends createZodDto(requestOvertimeSchema) {}
class ReportOvertimeBody extends createZodDto(reportOvertimeSchema) {}
class AuthorizeBody extends createZodDto(decideLeaveSchema) {}
class RejectBody extends createZodDto(rejectLeaveSchema) {}
class OvertimeCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión de la solicitud' };

// Horas extras con autorización previa (B36, decisión 5). El colaborador pide las suyas; Talento
// humano puede pedir a nombre de otro. Autoriza el jefe inmediato designado o quien autoriza sobre
// todos; el caso de uso revisa que le corresponda (numeral 15.4).

@ApiTags('Talento Humano')
@Controller('v1/hr/overtime')
@ApiPermissionErrors()
@RequirePermission('hr.employee.read')
export class OvertimeController {
  constructor(
    @Inject(OvertimeRequests) private readonly requests: OvertimeRequests,
    @Inject(OvertimeDecisions) private readonly decisions: OvertimeDecisions,
  ) {}

  @Get()
  @RequirePermission('hr.overtime.authorize')
  @ApiOperation({ summary: 'Consultar las horas extras de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: OvertimeListResponse, description: 'Horas extras' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: OvertimeListQuery,
  ): Promise<OvertimeListResponse> {
    return { data: await this.decisions.list({ principal, ability }, 'all', query.status) };
  }

  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Pedir autorización previa de horas extras' })
  @ZodResponse({ status: HttpStatus.CREATED, type: OvertimeCreatedResponse, description: 'Pedida' })
  async request(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RequestOvertimeBody,
  ): Promise<OvertimeCreatedResponse> {
    const viewer = { principal, ability };
    return { id: await this.requests.request(viewer, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/actions/authorize')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Autorizar horas extras antes de trabajarlas' })
  async authorize(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: AuthorizeBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.decide({ principal, ability }, meta, target, {
      authorize: true,
      note: input.note,
    });
  }

  @Post(':id/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'No autorizar horas extras, con el motivo' })
  async reject(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: RejectBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.decide({ principal, ability }, meta, target, {
      authorize: false,
      note: input.note,
    });
  }

  @Post(':id/actions/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Reportar las horas extras trabajadas' })
  async report(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: ReportOvertimeBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.report({ principal, ability }, meta, target, input.hours);
  }

  @Post(':id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Retirar una solicitud de horas extras propia' })
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.decisions.cancel({ principal, ability }, meta, target);
  }
}
