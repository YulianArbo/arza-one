import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  boardSchema,
  createItemRequestSchema,
  itemListQuerySchema,
  itemListResponseSchema,
  moveItemRequestSchema,
  planItemRequestSchema,
  sprintRequestSchema,
  updateItemRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ItemQueries } from '../application/item-queries.js';
import { ItemsUseCase } from '../application/items.js';
import { SprintsUseCase } from '../application/sprints.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class ItemListQuery extends createZodDto(itemListQuerySchema) {}
class ItemListResponse extends createZodDto(itemListResponseSchema) {}
class BoardResponse extends createZodDto(boardSchema) {}
class CreateItemRequest extends createZodDto(createItemRequestSchema) {}
class UpdateItemRequest extends createZodDto(updateItemRequestSchema) {}
class MoveItemRequest extends createZodDto(moveItemRequestSchema) {}
class PlanItemRequest extends createZodDto(planItemRequestSchema) {}
class SprintRequest extends createZodDto(sprintRequestSchema) {}

/** Iteraciones, lista de pendientes y tablero de un proyecto (M07, B26; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id')
@ApiPermissionErrors()
export class ProjectWorkController {
  constructor(
    @Inject(ItemQueries) private readonly queries: ItemQueries,
    @Inject(ItemsUseCase) private readonly items: ItemsUseCase,
    @Inject(SprintsUseCase) private readonly sprints: SprintsUseCase,
  ) {}

  @RequirePermission('project.read_member')
  @Get('items')
  @ApiOperation({
    summary: 'Lista de pendientes',
    description: 'Épicas, historias, tareas y defectos; por iteración o fuera de ellas.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: ItemListResponse, description: 'Ítems' })
  async listItems(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Query() query: ItemListQuery,
  ): Promise<ItemListResponse> {
    return this.queries.list(principal, ability, id, query);
  }

  @RequirePermission('project.read_member')
  @Get('board')
  @ApiOperation({
    summary: 'Tablero de trabajo',
    description:
      'La iteración en curso o, sin ella, los ítems fuera de iteraciones. El navegador lo pide cada 10 segundos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: BoardResponse, description: 'Tablero' })
  async board(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<BoardResponse> {
    return this.queries.board(principal, ability, id);
  }

  @RequirePermission('project.item.manage')
  @Post('items')
  @ApiOperation({ summary: 'Crear un ítem', description: 'Código del proyecto más su número.' })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async createItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: CreateItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.items.create({ principal, ability, meta }, id, body) };
  }

  @RequirePermission('project.item.manage')
  @Put('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar un ítem', description: 'Uno terminado se reabre primero.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async updateItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('itemId', UUID) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: itemId, version: versionFromIfMatch(ifMatch) };
    await this.items.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('project.item.manage')
  @Post('items/:itemId/actions/move')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Mover un ítem en el tablero',
    description:
      'Avanza de a una columna o vuelve a cualquiera anterior; terminar pide la revisión de código y las pruebas.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Movido' })
  @ApiProjectWriteErrors()
  async moveItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('itemId', UUID) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: MoveItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: itemId, version: versionFromIfMatch(ifMatch) };
    await this.items.move({ principal, ability, meta }, target, body);
  }

  @RequirePermission('project.item.manage')
  @Post('items/:itemId/actions/plan')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Llevar un ítem a una iteración',
    description: 'O devolverlo a la lista de pendientes. Sin criterios de aceptación no entra.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Planeado' })
  @ApiProjectWriteErrors()
  async planItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('itemId', UUID) itemId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PlanItemRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: itemId, version: versionFromIfMatch(ifMatch) };
    await this.items.plan({ principal, ability, meta }, target, body);
  }

  @RequirePermission('project.update')
  @Post('sprints')
  @ApiOperation({
    summary: 'Planear una iteración',
    description: 'Dentro de las fechas del proyecto.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creada' })
  @ApiProjectWriteErrors()
  async createSprint(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: SprintRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.sprints.create(principal, id, body, meta) };
  }

  @RequirePermission('project.update')
  @Put('sprints/:sprintId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar una iteración', description: 'Una cerrada ya no cambia.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiProjectWriteErrors()
  async updateSprint(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('sprintId', UUID) sprintId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: SprintRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: sprintId, version: versionFromIfMatch(ifMatch) };
    await this.sprints.update(principal, target, body, meta);
  }

  @RequirePermission('project.update')
  @Post('sprints/:sprintId/actions/start')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Iniciar una iteración', description: 'Solo una en curso a la vez.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'En curso' })
  @ApiProjectWriteErrors()
  async startSprint(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('sprintId', UUID) sprintId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: sprintId, version: versionFromIfMatch(ifMatch) };
    await this.sprints.start(principal, target, meta);
  }

  @RequirePermission('project.update')
  @Post('sprints/:sprintId/actions/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar una iteración',
    description: 'Lo que no se terminó vuelve a la lista de pendientes.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cerrada' })
  @ApiProjectWriteErrors()
  async closeSprint(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('sprintId', UUID) sprintId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: sprintId, version: versionFromIfMatch(ifMatch) };
    await this.sprints.close(principal, target, meta);
  }
}
