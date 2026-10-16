import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  activityListResponseSchema,
  activitySchema,
  createActivityRequestSchema,
  createProcessorRequestSchema,
  processorListResponseSchema,
  processorSchema,
  updateActivityRequestSchema,
  updateProcessorRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ActivitiesUseCase } from '../application/activities.js';
import { ProcessorsUseCase } from '../application/processors.js';
import { ApiIfMatch, ApiPrivacyErrors, PrivacyCreatedResponse } from './privacy-openapi.js';

class ActivityListResponse extends createZodDto(activityListResponseSchema) {}
class ActivityResponse extends createZodDto(activitySchema) {}
class CreateActivityRequest extends createZodDto(createActivityRequestSchema) {}
class UpdateActivityRequest extends createZodDto(updateActivityRequestSchema) {}
class ProcessorListResponse extends createZodDto(processorListResponseSchema) {}
class ProcessorResponse extends createZodDto(processorSchema) {}
class CreateProcessorRequest extends createZodDto(createProcessorRequestSchema) {}
class UpdateProcessorRequest extends createZodDto(updateProcessorRequestSchema) {}

/** Registro de actividades de tratamiento (M18, B17): Privacidad › Actividades de tratamiento. */
@ApiTags('Privacidad')
@Controller('v1/processing-activities')
@RequirePermission('privacy.activity.manage')
@ApiPermissionErrors()
export class ActivitiesController {
  constructor(@Inject(ActivitiesUseCase) private readonly activities: ActivitiesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Actividades de tratamiento' })
  @ZodResponse({ status: HttpStatus.OK, type: ActivityListResponse, description: 'Actividades' })
  async list(@CurrentPrincipal() principal: Principal): Promise<ActivityListResponse> {
    return { data: await this.activities.list(principal) };
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una actividad de tratamiento' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PrivacyCreatedResponse, description: 'Creada' })
  @ApiPrivacyErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateActivityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.activities.create(principal, body, meta) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una actividad de tratamiento' })
  @ZodResponse({ status: HttpStatus.OK, type: ActivityResponse, description: 'Actividad' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ActivityResponse> {
    return this.activities.get(principal, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar o inactivar la actividad' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: ActivityResponse, description: 'Actividad' })
  @ApiPrivacyErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateActivityRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ActivityResponse> {
    return this.activities.update(principal, id, versionFromIfMatch(ifMatch), body, meta);
  }
}

/** Encargados del tratamiento (M18, B17): Privacidad › Encargados. */
@ApiTags('Privacidad')
@Controller('v1/processors')
@RequirePermission('privacy.processor.manage')
@ApiPermissionErrors()
export class ProcessorsController {
  constructor(@Inject(ProcessorsUseCase) private readonly processors: ProcessorsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Encargados del tratamiento' })
  @ZodResponse({ status: HttpStatus.OK, type: ProcessorListResponse, description: 'Encargados' })
  async list(@CurrentPrincipal() principal: Principal): Promise<ProcessorListResponse> {
    return { data: await this.processors.list(principal) };
  }

  @Post()
  @ApiOperation({
    summary: 'Registrar un encargado',
    description: 'Sin contrato de transmisión queda con la alerta «Falta contrato».',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PrivacyCreatedResponse, description: 'Creado' })
  @ApiPrivacyErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateProcessorRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PrivacyCreatedResponse> {
    return { id: await this.processors.create(principal, body, meta) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un encargado' })
  @ZodResponse({ status: HttpStatus.OK, type: ProcessorResponse, description: 'Encargado' })
  @ApiPrivacyErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProcessorResponse> {
    return this.processors.get(principal, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar o inactivar el encargado' })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: ProcessorResponse, description: 'Encargado' })
  @ApiPrivacyErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateProcessorRequest,
    @Meta() meta: RequestMeta,
  ): Promise<ProcessorResponse> {
    return this.processors.update(principal, id, versionFromIfMatch(ifMatch), body, meta);
  }
}
