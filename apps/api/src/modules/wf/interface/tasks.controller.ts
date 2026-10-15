import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  completeTaskRequestSchema,
  decideTaskRequestSchema,
  handOverTaskRequestSchema,
  myTasksQuerySchema,
  rejectTaskRequestSchema,
  taskBoardQuerySchema,
  taskListResponseSchema,
  taskSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { TaskActionsUseCase } from '../application/task-actions.js';
import { TaskQueriesUseCase } from '../application/task-queries.js';
import { ApiWfWriteErrors } from './wf-openapi.js';

class MyTasksQuery extends createZodDto(myTasksQuerySchema) {}
class TaskBoardQuery extends createZodDto(taskBoardQuerySchema) {}
class TaskListResponse extends createZodDto(taskListResponseSchema) {}
class TaskResponse extends createZodDto(taskSchema) {}
class CompleteTaskRequest extends createZodDto(completeTaskRequestSchema) {}
class DecideTaskRequest extends createZodDto(decideTaskRequestSchema) {}
class RejectTaskRequest extends createZodDto(rejectTaskRequestSchema) {}
class HandOverTaskRequest extends createZodDto(handOverTaskRequestSchema) {}

const UUID = new ParseUUIDPipe();
const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' } as const;

/** Bandeja «Mis tareas», tablero y acciones sobre las tareas (ficha 17.5, numeral 14.3). */
@ApiTags('Tareas')
@Controller('v1/tasks')
@ApiPermissionErrors()
export class TasksController {
  constructor(
    @Inject(TaskQueriesUseCase) private readonly queries: TaskQueriesUseCase,
    @Inject(TaskActionsUseCase) private readonly actions: TaskActionsUseCase,
  ) {}

  @RequirePermission('wf.task.work')
  @Get('mine')
  @ApiOperation({
    summary: 'Mis tareas',
    description: 'Asignadas, de sus roles, delegadas o escaladas. Primero las vencidas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: TaskListResponse, description: 'Tareas' })
  async mine(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: MyTasksQuery,
  ): Promise<TaskListResponse> {
    return this.queries.mine(principal, ability, query);
  }

  @RequirePermission('wf.task.read_all')
  @Get()
  @ApiOperation({ summary: 'Tablero: las tareas de todas las personas, por páginas' })
  @ZodResponse({ status: HttpStatus.OK, type: TaskListResponse, description: 'Tareas' })
  async board(
    @CurrentPrincipal() principal: Principal,
    @Query() query: TaskBoardQuery,
  ): Promise<TaskListResponse> {
    return this.queries.board(principal, query);
  }

  @RequirePermission('wf.task.work')
  @Get(':id')
  @ApiOperation({ summary: 'Una tarea, sus acciones y el historial del trámite' })
  @ZodResponse({ status: HttpStatus.OK, type: TaskResponse, description: 'Tarea' })
  @ApiWfWriteErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<TaskResponse> {
    return this.queries.get(principal, ability, id);
  }

  @RequirePermission('wf.task.work')
  @Post(':id/actions/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tomar la tarea', description: 'Pendiente → en curso.' })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async start(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.start({ principal, ability, meta }, id);
  }

  @RequirePermission('wf.task.work')
  @Post(':id/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Completar con una de las acciones del paso' })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async complete(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CompleteTaskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.complete({ principal, ability, meta }, id, body);
  }

  @RequirePermission('wf.task.work')
  @Post(':id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Aprobar' })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: DecideTaskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.approve({ principal, ability, meta }, id, body);
  }

  @RequirePermission('wf.task.work')
  @Post(':id/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechazar', description: 'El motivo es obligatorio.' })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async reject(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: RejectTaskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.reject({ principal, ability, meta }, id, body);
  }

  @RequirePermission('wf.task.work')
  @Post(':id/actions/delegate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delegar la tarea a otro colaborador', description: 'El plazo sigue.' })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async delegate(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: HandOverTaskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.delegate({ principal, ability, meta }, id, body);
  }

  @RequirePermission('wf.task.reassign')
  @Post(':id/actions/reassign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reasignar la tarea',
    description: 'Recibe un plazo nuevo desde ahora.',
  })
  @ApiResponse(DONE)
  @ApiWfWriteErrors()
  async reassign(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: HandOverTaskRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.reassign({ principal, ability, meta }, id, body);
  }
}
