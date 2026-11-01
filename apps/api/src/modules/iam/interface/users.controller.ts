import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Headers,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  assignRoleRequestSchema,
  closedSessionsResponseSchema,
  createdResponseSchema,
  errorResponseSchema,
  inviteUserRequestSchema,
  inviteUserResponseSchema,
  updateUserRequestSchema,
  userDetailResponseSchema,
  userListQuerySchema,
  userListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { InvitationUseCase } from '../application/invitation.js';
import { RoleAssignmentUseCase } from '../application/role-assignment.js';
import { SecondFactorResetUseCase } from '../application/second-factor-reset.js';
import { UserAdministration } from '../application/user-admin.js';
import { UserDirectoryQuery } from '../application/user-directory.js';
import { UserPositionUseCase } from '../application/user-position.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class UserListQuery extends createZodDto(userListQuerySchema) {}
class UserListResponse extends createZodDto(userListResponseSchema) {}
class UserDetailResponse extends createZodDto(userDetailResponseSchema) {}
class InviteUserRequest extends createZodDto(inviteUserRequestSchema) {}
class InviteUserResponse extends createZodDto(inviteUserResponseSchema) {}
class UpdateUserRequest extends createZodDto(updateUserRequestSchema) {}
class AssignRoleRequest extends createZodDto(assignRoleRequestSchema) {}
class AssignmentCreatedResponse extends createZodDto(createdResponseSchema) {}
class RevokedSessionsResponse extends createZodDto(closedSessionsResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

const USER_ID = new ParseUUIDPipe();

/**
 * Administración de usuarios (B10, ficha 17.2): listar, invitar, bloquear, reiniciar el segundo
 * factor, cerrar sesiones, asignar roles y el cargo. Cada ruta declara su permiso del anexo G; nadie actúa
 * sobre su propia cuenta desde aquí.
 */
@ApiTags('Usuarios y roles')
@Controller('v1')
@ApiPermissionErrors()
export class UsersController {
  constructor(
    @Inject(UserDirectoryQuery) private readonly directory: UserDirectoryQuery,
    @Inject(InvitationUseCase) private readonly invitations: InvitationUseCase,
    @Inject(UserAdministration) private readonly admin: UserAdministration,
    @Inject(SecondFactorResetUseCase) private readonly secondFactor: SecondFactorResetUseCase,
    @Inject(RoleAssignmentUseCase) private readonly roles: RoleAssignmentUseCase,
    @Inject(UserPositionUseCase) private readonly positions: UserPositionUseCase,
  ) {}

  @RequirePermission('iam.user.read')
  @Get('users')
  @ApiOperation({ summary: 'Usuarios de la empresa, con sus roles vigentes' })
  @ZodResponse({ status: HttpStatus.OK, type: UserListResponse, description: 'Una página' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: UserListQuery,
  ): Promise<UserListResponse> {
    return this.directory.list(principal, query);
  }

  @RequirePermission('iam.user.read')
  @Get('users/:id')
  @ApiOperation({
    summary: 'Ficha de un usuario',
    description:
      'Los datos de seguridad solo los ve quien puede bloquear o reiniciar el segundo factor.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: UserDetailResponse, description: 'Ficha' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'No existe',
  })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', USER_ID) userId: string,
  ): Promise<UserDetailResponse> {
    return this.directory.detail(principal, ability, userId);
  }

  @RequirePermission('iam.user.invite')
  @Post('users')
  @ApiOperation({
    summary: 'Invitar a una persona',
    description: 'Las internas reciben además el rol COLABORADOR. El enlace vence en 72 horas.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: InviteUserResponse, description: 'Invitada' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'Correo en uso',
  })
  async invite(
    @CurrentPrincipal() principal: Principal,
    @Body() body: InviteUserRequest,
    @Meta() meta: RequestMeta,
  ): Promise<InviteUserResponse> {
    const result = await this.invitations.invite({
      tenantId: principal.tenantId,
      email: body.email,
      kind: body.kind,
      displayName: body.display_name,
      actorId: principal.userId,
      roleIds: body.role_ids,
      partyId: body.party_id,
      meta,
    });
    return { id: result.userId, outcome: result.outcome };
  }

  @RequirePermission('iam.user.invite')
  @Post('users/:id/actions/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reenviar la invitación de una cuenta que sigue invitada' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Invitación reenviada' })
  async resendInvitation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.invitations.resend(principal, userId, meta);
  }

  @RequirePermission('iam.user.lock')
  @Post('users/:id/actions/lock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bloquear una cuenta y cerrar sus sesiones' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cuenta bloqueada' })
  async lock(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.admin.lock({ principal, userId, meta });
  }

  @RequirePermission('iam.user.lock')
  @RecentAuthentication()
  @Post('users/:id/actions/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desbloquear una cuenta', description: 'Exige confirmar la identidad.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cuenta desbloqueada' })
  async unlock(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.admin.unlock({ principal, userId, meta });
  }

  @RequirePermission('iam.user.reset_mfa')
  @RecentAuthentication()
  @Post('users/:id/actions/reset-mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reiniciar el segundo factor de otra persona',
    description:
      'Cierra sus sesiones; al entrar lo configura de nuevo. Exige confirmar la identidad.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: RevokedSessionsResponse, description: 'Reiniciado' })
  async resetSecondFactor(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<RevokedSessionsResponse> {
    return { closed: await this.secondFactor.forUser(principal, userId, meta) };
  }

  @RequirePermission('iam.session.revoke')
  @RecentAuthentication()
  @Post('users/:id/actions/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar todas las sesiones de una persona' })
  @ZodResponse({ status: HttpStatus.OK, type: RevokedSessionsResponse, description: 'Cerradas' })
  async revokeSessions(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Meta() meta: RequestMeta,
  ): Promise<RevokedSessionsResponse> {
    return { closed: await this.admin.revokeSessions({ principal, userId, meta }) };
  }

  @RequirePermission('iam.session.revoke')
  @RecentAuthentication()
  @Post('sessions/actions/revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar todas las sesiones de la empresa, salvo la suya (respuesta a incidentes)',
  })
  @ZodResponse({ status: HttpStatus.OK, type: RevokedSessionsResponse, description: 'Cerradas' })
  async revokeAll(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<RevokedSessionsResponse> {
    return { closed: await this.admin.revokeAllInTenant(principal, meta) };
  }

  @RequirePermission('iam.user.update')
  @Patch('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Editar la ficha de una persona interna: su cargo',
    description:
      'Del cargo sale su jefe inmediato en los flujos de aprobación. El cargo debe estar activo. ' +
      'Nunca sobre la propia cuenta.',
  })
  @ApiHeader({ name: 'If-Match', description: 'Versión de la ficha', required: true })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Ficha guardada' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'El usuario o el cargo no existen',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponse.Output,
    description: 'Otra versión, o una cuenta que no ocupa cargos',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'El cargo está inactivo',
  })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateUserRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id: userId, version: versionFromIfMatch(ifMatch) };
    await this.positions.assign({ principal, target, positionId: body.position_id, meta });
  }

  @RequirePermission('iam.role.assign')
  @RecentAuthentication()
  @Post('users/:id/roles')
  @ApiOperation({ summary: 'Asignar un rol', description: 'Nunca a uno mismo.' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: AssignmentCreatedResponse,
    description: 'Asignado',
  })
  async assignRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Body() body: AssignRoleRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AssignmentCreatedResponse> {
    return { id: await this.roles.assign(principal, userId, body, meta) };
  }

  @RequirePermission('iam.role.assign')
  @RecentAuthentication()
  @Post('users/:id/roles/:assignmentId/actions/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar un rol', description: 'Nunca a uno mismo.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  async revokeRole(
    @CurrentPrincipal() principal: Principal,
    @Param('id', USER_ID) userId: string,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.roles.revoke(principal, { userId, assignmentId }, meta);
  }
}
