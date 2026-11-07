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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  projectPortalRequestSchema,
  shareFileRequestSchema,
  sharedFileListSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ClientSharingUseCase } from '../application/client-sharing.js';
import {
  ApiProjectIfMatch,
  ApiProjectWriteErrors,
  ProjectCreatedResponse,
  UUID,
} from './project-openapi.js';

class ProjectPortalRequest extends createZodDto(projectPortalRequestSchema) {}
class ShareFileRequest extends createZodDto(shareFileRequestSchema) {}
class SharedFileListResponse extends createZodDto(sharedFileListSchema) {}

/** Lo que el equipo deja ver al cliente en el portal (M07 para M09, B30; decisiones 2 y 5). */
@ApiTags('Proyectos')
@Controller('v1/projects/:id')
@ApiPermissionErrors()
export class ProjectSharingController {
  constructor(@Inject(ClientSharingUseCase) private readonly sharing: ClientSharingUseCase) {}

  @RequirePermission('project.read_member')
  @Get('shared-files')
  @ApiOperation({
    summary: 'Lo compartido con el cliente',
    description: 'Si el proyecto se ve en el portal y los archivos compartidos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SharedFileListResponse, description: 'Compartido' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<SharedFileListResponse> {
    return this.sharing.list(principal, ability, id);
  }

  @RequirePermission('project.update')
  @Put('portal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Ver u ocultar en el portal',
    description: 'El cliente ve el proyecto desde que inicia, salvo que se oculte.',
  })
  @ApiProjectIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiProjectWriteErrors()
  async setVisible(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ProjectPortalRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.sharing.setVisible(principal, ability, target, body.visible, meta);
  }

  @RequirePermission('project.update')
  @Post('shared-files')
  @ApiOperation({
    summary: 'Compartir un archivo con el cliente',
    description: 'Un archivo que usted subió y pasó el antivirus. Lo verá en Documentos.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: ProjectCreatedResponse, description: 'Creado' })
  @ApiProjectWriteErrors()
  async share(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: ShareFileRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectCreatedResponse> {
    return { id: await this.sharing.share(principal, ability, id, body, meta) };
  }

  @RequirePermission('project.update')
  @Delete('shared-files/:sharedId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Dejar de compartir',
    description: 'El cliente deja de verlo; el archivo sigue en el expediente.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiProjectWriteErrors()
  async unshare(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) projectId: string,
    @Param('sharedId', UUID) sharedId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.sharing.unshare(principal, ability, { projectId, id: sharedId }, meta);
  }
}
