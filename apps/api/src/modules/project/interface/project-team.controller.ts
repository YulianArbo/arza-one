import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  linkRequestSchema,
  memberRequestSchema,
  milestoneRequestSchema,
  updateMemberRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { MembersUseCase } from '../application/members.js';
import { PlanningUseCase } from '../application/planning.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class MemberRequest extends createZodDto(memberRequestSchema) {}
class UpdateMemberRequest extends createZodDto(updateMemberRequestSchema) {}
class MilestoneRequest extends createZodDto(milestoneRequestSchema) {}
class LinkRequest extends createZodDto(linkRequestSchema) {}

/** Equipo, hitos y enlaces de un proyecto (M07, B26; ficha 17.8). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id')
@ApiPermissionErrors()
export class ProjectTeamController {
  constructor(
    @Inject(MembersUseCase) private readonly members: MembersUseCase,
    @Inject(PlanningUseCase) private readonly planning: PlanningUseCase,
  ) {}

  @RequirePermission('project.member.manage')
  @Post('members')
  @ApiOperation({
    summary: 'Agregar a alguien al equipo',
    description: 'Colaborador activo con su rol y su dedicación; recibe un aviso.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: ProjectCreatedResponse,
    description: 'Agregado',
  })
  @ApiProjectWriteErrors()
  async addMember(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: MemberRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.members.add(principal, id, body, meta) };
  }

  @RequirePermission('project.member.manage')
  @Put('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar el rol o la dedicación', description: 'Del miembro.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async updateMember(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('memberId', UUID) memberId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateMemberRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: memberId, version: versionFromIfMatch(ifMatch) };
    await this.members.update(principal, target, body, meta);
  }

  @RequirePermission('project.member.manage')
  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Retirar a alguien del equipo',
    description: 'Pierde el acceso de inmediato; sus ítems abiertos quedan sin asignar.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiProjectWriteErrors()
  async removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('memberId', UUID) memberId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: memberId, version: versionFromIfMatch(ifMatch) };
    await this.members.remove(principal, target, meta);
  }

  @RequirePermission('project.update')
  @Post('milestones')
  @ApiOperation({
    summary: 'Agregar un hito',
    description: 'Con su fecha y el porcentaje que se factura; entre todos, máximo 100 %.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async createMilestone(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: MilestoneRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.planning.createMilestone(principal, id, body, meta) };
  }

  @RequirePermission('project.update')
  @Put('milestones/:milestoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Editar un hito', description: 'Uno cumplido ya no cambia.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async updateMilestone(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('milestoneId', UUID) milestoneId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: MilestoneRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: milestoneId, version: versionFromIfMatch(ifMatch) };
    await this.planning.updateMilestone(principal, target, body, meta);
  }

  @RequirePermission('project.update')
  @Post('milestones/:milestoneId/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar un hito como cumplido', description: 'Ya no cambia.' })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cumplido' })
  @ApiProjectWriteErrors()
  async completeMilestone(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('milestoneId', UUID) milestoneId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { projectId, id: milestoneId, version: versionFromIfMatch(ifMatch) };
    await this.planning.completeMilestone(principal, target, meta);
  }

  @RequirePermission('project.update')
  @Post('links')
  @ApiOperation({
    summary: 'Agregar un enlace',
    description: 'Al repositorio, a un entorno o al diseño; solo direcciones https.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async addLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: LinkRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.planning.addLink(principal, id, body, meta) };
  }

  @RequirePermission('project.update')
  @Delete('links/:linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar un enlace', description: 'Queda en la auditoría.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Quitado' })
  @ApiProjectWriteErrors()
  async removeLink(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) projectId: string,
    @Param('linkId', UUID) linkId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.planning.removeLink(principal, { projectId, id: linkId }, meta);
  }
}
