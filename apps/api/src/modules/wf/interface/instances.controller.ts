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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { instanceActionRequestSchema, instanceSchema, wfKeySchema } from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { ZodValidationPipe } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { InstancesUseCase } from '../application/instances.js';
import { ApiWfWriteErrors } from './wf-openapi.js';

class InstanceResponse extends createZodDto(instanceSchema) {}
class InstanceActionRequest extends createZodDto(instanceActionRequestSchema) {}

const UUID = new ParseUUIDPipe();

/** Trámites: estado, acciones posibles e historial; transiciones por acción explícita (14.1). */
@ApiTags('Tareas')
@Controller('v1/workflow-instances')
@ApiPermissionErrors()
@RequirePermission('wf.task.work')
export class InstancesController {
  constructor(@Inject(InstancesUseCase) private readonly instances: InstancesUseCase) {}

  @Get(':id')
  @ApiOperation({ summary: 'Un trámite: estado, acciones que usted puede pedir e historial' })
  @ZodResponse({ status: HttpStatus.OK, type: InstanceResponse, description: 'Trámite' })
  @ApiWfWriteErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<InstanceResponse> {
    return this.instances.get(principal, ability, id);
  }

  @Post(':id/actions/:action')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hacer una transición del flujo',
    description:
      'La acción debe estar definida para el estado actual; si no, responde 409 WF_TRANSITION_NOT_ALLOWED.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiWfWriteErrors()
  async act(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Param('action', new ZodValidationPipe(wfKeySchema)) action: string,
    @Body() body: InstanceActionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.instances.act({ principal, ability, meta }, id, action, body);
  }
}
