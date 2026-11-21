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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addCommitteeMemberSchema,
  committeeMemberListResponseSchema,
  committeeMinuteListResponseSchema,
  committeeQuerySchema,
  complaintListResponseSchema,
  endCommitteeMemberSchema,
  fileComplaintSchema,
  handleComplaintSchema,
  ownComplaintSchema,
  recordCommitteeMinuteSchema,
  sstCreatedResponseSchema,
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
import { Committees } from '../application/committees.js';
import { Complaints } from '../application/complaints.js';

class SstMemberListResponse extends createZodDto(committeeMemberListResponseSchema) {}
class SstMemberBody extends createZodDto(addCommitteeMemberSchema) {}
class SstEndMemberBody extends createZodDto(endCommitteeMemberSchema) {}
class SstMinuteListResponse extends createZodDto(committeeMinuteListResponseSchema) {}
class SstMinuteQueryBody extends createZodDto(committeeQuerySchema) {}
class SstMinuteBody extends createZodDto(recordCommitteeMinuteSchema) {}
class SstComplaintListResponse extends createZodDto(complaintListResponseSchema) {}
class SstComplaintBody extends createZodDto(fileComplaintSchema) {}
class SstComplaintResponse extends createZodDto(ownComplaintSchema) {}
class SstHandleBody extends createZodDto(handleComplaintSchema) {}
class SstCreatedResponse extends createZodDto(sstCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Comités, actas y quejas de convivencia (B37, decisiones 8 y 9). Lo del Comité de Convivencia lo
// atienden solo sus integrantes vigentes: la ruta pide el permiso que tiene todo colaborador y el
// caso de uso exige ser integrante (403 si no lo es).

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst')
@ApiPermissionErrors()
export class CommitteesController {
  constructor(
    @Inject(Committees) private readonly committees: Committees,
    @Inject(Complaints) private readonly complaints: Complaints,
  ) {}

  @Get('committee-members')
  @RequirePermission('sst.committee.read')
  @ApiOperation({ summary: 'Consultar los integrantes de los comités' })
  @ZodResponse({ status: HttpStatus.OK, type: SstMemberListResponse, description: 'Integrantes' })
  async members(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<SstMemberListResponse> {
    return { data: await this.committees.members({ principal, ability }) };
  }

  @Post('committee-members')
  @RequirePermission('sst.committee.manage')
  @ApiOperation({ summary: 'Agregar un integrante a un comité' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Agregado' })
  async addMember(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: SstMemberBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.committees.addMember({ principal, ability }, meta, input) };
  }

  @Post('committee-members/:id/actions/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.committee.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Terminar el periodo de un integrante' })
  async endMember(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstEndMemberBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.committees.endMember({ principal, ability }, meta, target, input);
  }

  @Post('committee-minutes/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sst.incident.report')
  @ApiOperation({ summary: 'Consultar las actas de un comité (Convivencia: solo integrantes)' })
  @ZodResponse({ status: HttpStatus.OK, type: SstMinuteListResponse, description: 'Actas' })
  async minutes(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: SstMinuteQueryBody,
  ): Promise<SstMinuteListResponse> {
    return { data: await this.committees.minutes({ principal, ability }, meta, input.committee) };
  }

  @Post('committee-minutes')
  @RequirePermission('sst.incident.report')
  @ApiOperation({ summary: 'Registrar el acta de una reunión del comité' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Registrada' })
  async recordMinute(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Body() input: SstMinuteBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.committees.recordMinute({ principal, ability }, meta, input) };
  }

  @Post('complaints')
  @RequirePermission('sst.incident.report')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Presentar una queja confidencial al Comité de Convivencia' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstComplaintResponse, description: 'Recibida' })
  async file(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SstComplaintBody,
  ): Promise<SstComplaintResponse> {
    return this.complaints.file(principal, meta, idempotencyKeyFrom(key), input);
  }

  @Post('complaints/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sst.incident.report')
  @ApiOperation({
    summary: 'Consultar las quejas (solo integrantes de Convivencia); queda registrado',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SstComplaintListResponse, description: 'Quejas' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<SstComplaintListResponse> {
    return { data: await this.complaints.list(principal, meta) };
  }

  @Post('complaints/:id/actions/handle')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('sst.incident.report')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Tramitar o cerrar una queja (solo integrantes de Convivencia)' })
  async handle(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: SstHandleBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.complaints.handle(principal, meta, target, input);
  }
}
