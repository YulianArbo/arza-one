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
  completeMyTaskSchema,
  hrCreatedResponseSchema,
  leaveRequestListResponseSchema,
  myTaskListResponseSchema,
  mySpaceResponseSchema,
  noveltyListResponseSchema,
  overtimeListResponseSchema,
  ownDisciplinaryListResponseSchema,
  performanceReviewListResponseSchema,
  requestLeaveSchema,
  trainingListResponseSchema,
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
import { DisciplinaryCases } from '../application/disciplinary-cases.js';
import { LeaveDecisions } from '../application/leave-decisions.js';
import { LeaveRequests } from '../application/leave-requests.js';
import { MySpaceQueries } from '../application/my-space.js';
import { MyTasks } from '../application/my-tasks.js';
import { OvertimeDecisions } from '../application/overtime-decisions.js';
import { PerformanceReviews } from '../application/performance-reviews.js';
import { Trainings } from '../application/trainings.js';

class MySpaceResponse extends createZodDto(mySpaceResponseSchema) {}
class LeaveListResponse extends createZodDto(leaveRequestListResponseSchema) {}
class OvertimeListResponse extends createZodDto(overtimeListResponseSchema) {}
class NoveltyListResponse extends createZodDto(noveltyListResponseSchema) {}
class ReviewListResponse extends createZodDto(performanceReviewListResponseSchema) {}
class TrainingListResponse extends createZodDto(trainingListResponseSchema) {}
class OwnCaseListResponse extends createZodDto(ownDisciplinaryListResponseSchema) {}
class TaskListResponse extends createZodDto(myTaskListResponseSchema) {}
class RequestLeaveBody extends createZodDto(requestLeaveSchema) {}
class CompleteTaskBody extends createZodDto(completeMyTaskSchema) {}
class LeaveCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// «Mi espacio» (B36, autoservicio, numeral 15.4 «Propiedad»): todo lo de la propia persona. Las
// consultas de «Mi equipo» devuelven solo lo que le toca decidir como jefe inmediato.

@ApiTags('Talento Humano')
@Controller('v1/hr/me')
@ApiPermissionErrors()
@RequirePermission('hr.employee.read')
export class MySpaceController {
  constructor(
    @Inject(MySpaceQueries) private readonly space: MySpaceQueries,
    @Inject(LeaveRequests) private readonly leaveRequests: LeaveRequests,
    @Inject(LeaveDecisions) private readonly leaves: LeaveDecisions,
    @Inject(OvertimeDecisions) private readonly overtime: OvertimeDecisions,
    @Inject(PerformanceReviews) private readonly reviews: PerformanceReviews,
    @Inject(Trainings) private readonly trainings: Trainings,
    @Inject(DisciplinaryCases) private readonly cases: DisciplinaryCases,
    @Inject(MyTasks) private readonly tasks: MyTasks,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mis datos laborales y mi saldo de vacaciones' })
  @ZodResponse({ status: HttpStatus.OK, type: MySpaceResponse, description: 'Mi espacio' })
  async summary(@CurrentPrincipal() principal: Principal): Promise<MySpaceResponse> {
    return this.space.summary(principal);
  }

  @Get('leave-requests')
  @ApiOperation({ summary: 'Mis solicitudes de ausencia' })
  @ZodResponse({ status: HttpStatus.OK, type: LeaveListResponse, description: 'Ausencias' })
  async myLeaves(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<LeaveListResponse> {
    return { data: await this.leaves.mine({ principal, ability }) };
  }

  @Post('leave-requests')
  @RequirePermission('hr.leave.request')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Solicitar vacaciones, un permiso o una licencia' })
  @ZodResponse({ status: HttpStatus.CREATED, type: LeaveCreatedResponse, description: 'Radicada' })
  async requestLeave(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: RequestLeaveBody,
  ): Promise<LeaveCreatedResponse> {
    return {
      id: await this.leaveRequests.request(principal, meta, idempotencyKeyFrom(key), input),
    };
  }

  @Post('leave-requests/:id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.leave.request')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Retirar mi solicitud mientras está radicada' })
  async cancelLeave(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.leaves.cancel({ principal, ability }, meta, target);
  }

  @Get('overtime')
  @ApiOperation({ summary: 'Mis horas extras' })
  @ZodResponse({ status: HttpStatus.OK, type: OvertimeListResponse, description: 'Horas extras' })
  async myOvertime(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<OvertimeListResponse> {
    return { data: await this.overtime.list({ principal, ability }, 'mine', undefined) };
  }

  @Get('novelties')
  @ApiOperation({ summary: 'Mis novedades de nómina' })
  @ZodResponse({ status: HttpStatus.OK, type: NoveltyListResponse, description: 'Novedades' })
  async myNovelties(@CurrentPrincipal() principal: Principal): Promise<NoveltyListResponse> {
    return { data: await this.space.novelties(principal) };
  }

  @Get('performance-reviews')
  @ApiOperation({ summary: 'Mis evaluaciones de desempeño' })
  @ZodResponse({ status: HttpStatus.OK, type: ReviewListResponse, description: 'Evaluaciones' })
  async myReviews(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<ReviewListResponse> {
    return { data: await this.reviews.list({ principal, ability }, 'mine') };
  }

  @Get('trainings')
  @ApiOperation({ summary: 'Mi formación y bienestar' })
  @ZodResponse({ status: HttpStatus.OK, type: TrainingListResponse, description: 'Formación' })
  async myTrainings(@CurrentPrincipal() principal: Principal): Promise<TrainingListResponse> {
    return { data: await this.trainings.mine(principal) };
  }

  @Post('disciplinary-cases/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mis citaciones y decisiones; la consulta queda registrada' })
  @ZodResponse({ status: HttpStatus.OK, type: OwnCaseListResponse, description: 'Casos' })
  async myCases(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<OwnCaseListResponse> {
    return { data: await this.cases.mine(principal, meta) };
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Tareas de inducción y de retiro a mi cargo' })
  @ZodResponse({ status: HttpStatus.OK, type: TaskListResponse, description: 'Tareas' })
  async myTasks(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<TaskListResponse> {
    return { data: await this.tasks.list({ principal, ability }) };
  }

  @Post('tasks/onboarding/:id/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Marcar hecha una tarea de inducción a mi cargo' })
  async completeOnboarding(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CompleteTaskBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.tasks.completeOnboarding({ principal, ability }, meta, target, input);
  }
}
