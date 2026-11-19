import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  leaveRequestListResponseSchema,
  overtimeListResponseSchema,
  performanceReviewListResponseSchema,
  teamResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { LeaveDecisions } from '../application/leave-decisions.js';
import { MySpaceQueries } from '../application/my-space.js';
import { OvertimeDecisions } from '../application/overtime-decisions.js';
import { PerformanceReviews } from '../application/performance-reviews.js';

class TeamResponse extends createZodDto(teamResponseSchema) {}
class LeaveListResponse extends createZodDto(leaveRequestListResponseSchema) {}
class OvertimeListResponse extends createZodDto(overtimeListResponseSchema) {}
class ReviewListResponse extends createZodDto(performanceReviewListResponseSchema) {}

// «Mi equipo» (B36, numeral 15.4): el jefe inmediato ve a su equipo directo con su saldo de
// vacaciones y lo que le toca decidir o calificar. Quien no tiene equipo recibe listas vacías.

@ApiTags('Talento Humano')
@Controller('v1/hr/me/team')
@ApiPermissionErrors()
@RequirePermission('hr.employee.read')
export class MyTeamController {
  constructor(
    @Inject(MySpaceQueries) private readonly space: MySpaceQueries,
    @Inject(LeaveDecisions) private readonly leaves: LeaveDecisions,
    @Inject(OvertimeDecisions) private readonly overtime: OvertimeDecisions,
    @Inject(PerformanceReviews) private readonly reviews: PerformanceReviews,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mi equipo directo con su saldo de vacaciones' })
  @ZodResponse({ status: HttpStatus.OK, type: TeamResponse, description: 'Equipo' })
  async team(@CurrentPrincipal() principal: Principal): Promise<TeamResponse> {
    return { data: await this.space.team(principal) };
  }

  @Get('leave-requests')
  @ApiOperation({ summary: 'Ausencias de mi equipo que me toca decidir' })
  @ZodResponse({ status: HttpStatus.OK, type: LeaveListResponse, description: 'Ausencias' })
  async leaveRequests(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<LeaveListResponse> {
    return { data: await this.leaves.team({ principal, ability }) };
  }

  @Get('overtime')
  @ApiOperation({ summary: 'Horas extras de mi equipo por autorizar' })
  @ZodResponse({ status: HttpStatus.OK, type: OvertimeListResponse, description: 'Horas extras' })
  async overtimeList(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<OvertimeListResponse> {
    return { data: await this.overtime.list({ principal, ability }, 'team', undefined) };
  }

  @Get('performance-reviews')
  @ApiOperation({ summary: 'Evaluaciones de mi equipo' })
  @ZodResponse({ status: HttpStatus.OK, type: ReviewListResponse, description: 'Evaluaciones' })
  async reviewList(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<ReviewListResponse> {
    return { data: await this.reviews.list({ principal, ability }, 'team') };
  }
}
