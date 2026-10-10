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
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createdResponseSchema,
  createRoleRequestSchema,
  errorResponseSchema,
  permissionCatalogResponseSchema,
  roleDetailResponseSchema,
  roleListResponseSchema,
  updateRoleRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { RoleAdminUseCase } from '../application/role-admin.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PermissionCatalogResponse extends createZodDto(permissionCatalogResponseSchema) {}
class RoleListResponse extends createZodDto(roleListResponseSchema) {}
class RoleDetailResponse extends createZodDto(roleDetailResponseSchema) {}
class CreateRoleRequest extends createZodDto(createRoleRequestSchema) {}
class UpdateRoleRequest extends createZodDto(updateRoleRequestSchema) {}
class RoleCreatedResponse extends createZodDto(createdResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/**
 * Roles y catálogo de permisos (B10). Los roles del sistema se consultan pero no se editan; los
 * personalizados se crean y editan con iam.role.manage. Nadie edita un rol que tiene.
 */
@ApiTags('Usuarios y roles')
@Controller('v1')
@ApiPermissionErrors()
export class RolesController {
  constructor(@Inject(RoleAdminUseCase) private readonly roles: RoleAdminUseCase) {}

  @RequirePermission('iam.role.read')
  @Get('permissions')
  @ApiOperation({ summary: 'Catálogo de permisos del anexo G, por módulo' })
  @ZodResponse({ status: HttpStatus.OK, type: PermissionCatalogResponse, description: 'Catálogo' })
  catalog(): PermissionCatalogResponse {
    return this.roles.catalog();
  }

  @RequirePermission('iam.role.read')
  @Get('roles')
  @ApiOperation({ summary: 'Roles de la empresa: los del sistema y los personalizados' })
  @ZodResponse({ status: HttpStatus.OK, type: RoleListResponse, description: 'Roles' })
  async list(@CurrentPrincipal() principal: Principal): Promise<RoleListResponse> {
    return { data: await this.roles.list(principal) };
  }

  @RequirePermission('iam.role.read')
  @Get('roles/:id')
  @ApiOperation({ summary: 'Un rol con sus permisos' })
  @ZodResponse({ status: HttpStatus.OK, type: RoleDetailResponse, description: 'Rol' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'No existe',
  })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) roleId: string,
  ): Promise<RoleDetailResponse> {
    return this.roles.detail(principal, roleId);
  }

  @RequirePermission('iam.role.manage')
  @RecentAuthentication()
  @Post('roles')
  @ApiOperation({
    summary: 'Crear un rol personalizado',
    description: 'Exige confirmar la identidad.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: RoleCreatedResponse, description: 'Creado' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'Nombre en uso',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateRoleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<RoleCreatedResponse> {
    return { id: await this.roles.create(principal, body, meta) };
  }

  @RequirePermission('iam.role.manage')
  @RecentAuthentication()
  @Patch('roles/:id')
  @ApiOperation({
    summary: 'Editar un rol personalizado',
    description: 'Nunca un rol del sistema ni uno que usted tenga. Exige confirmar la identidad.',
  })
  @ApiHeader({ name: 'If-Match', description: 'Versión del rol que se editó', required: true })
  @ZodResponse({ status: HttpStatus.OK, type: RoleDetailResponse, description: 'Rol editado' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'Otra versión',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Rol del sistema o permisos que no caben en el rol',
  })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) roleId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateRoleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<RoleDetailResponse> {
    const target = { roleId, version: versionFromIfMatch(ifMatch) };
    return this.roles.update(principal, target, body, meta);
  }
}
