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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  acceptPortalTermsRequestSchema,
  invitePortalUserRequestSchema,
  portalDataExportSchema,
  portalMyDataSchema,
  portalTermsSchema,
  portalUserListSchema,
  portalUserProjectsRequestSchema,
  updatePortalMyDataRequestSchema,
  updatePortalUserRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PortalActions } from '../application/portal-actions.js';
import { PortalPeople } from '../application/portal-people.js';
import {
  ApiPortalErrors,
  ApiPortalWriteErrors,
  PortalCreatedResponse,
  UUID,
} from './portal-openapi.js';

class PortalTermsResponse extends createZodDto(portalTermsSchema) {}
class AcceptPortalTermsRequest extends createZodDto(acceptPortalTermsRequestSchema) {}
class PortalMyDataResponse extends createZodDto(portalMyDataSchema) {}
class UpdatePortalMyDataRequest extends createZodDto(updatePortalMyDataRequestSchema) {}
class PortalDataExportResponse extends createZodDto(portalDataExportSchema) {}
class PortalUserListResponse extends createZodDto(portalUserListSchema) {}
class InvitePortalUserRequest extends createZodDto(invitePortalUserRequestSchema) {}
class UpdatePortalUserRequest extends createZodDto(updatePortalUserRequestSchema) {}
class PortalUserProjectsRequest extends createZodDto(portalUserProjectsRequestSchema) {}

const IF_MATCH = { name: 'If-Match', description: 'Versión del registro', required: true };

/**
 * La cuenta del cliente en el portal (M09, B30; ficha 17.10): los términos del primer ingreso, sus
 * datos y su copia, y los usuarios de su empresa (solo el administrador del cliente).
 */
@ApiTags('Portal del cliente')
@Controller('v1/portal')
@ApiPermissionErrors()
@ApiPortalErrors()
export class PortalAccountController {
  constructor(
    @Inject(PortalActions) private readonly actions: PortalActions,
    @Inject(PortalPeople) private readonly people: PortalPeople,
  ) {}

  @RequirePermission('portal.personal_data.manage')
  @Get('terms')
  @ApiOperation({
    summary: 'Términos vigentes',
    description: 'Los términos de uso y la política de privacidad, y si ya los aceptó.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalTermsResponse, description: 'Términos' })
  async terms(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalTermsResponse> {
    return this.actions.terms({ principal, ability });
  }

  @RequirePermission('portal.personal_data.manage')
  @Post('terms/acceptance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aceptar los términos',
    description: 'Las versiones que leyó; si cambiaron mientras leía, debe verlas de nuevo.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aceptados' })
  @ApiPortalWriteErrors()
  async acceptTerms(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: AcceptPortalTermsRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.acceptTerms({ principal, ability, meta }, body);
  }

  @RequirePermission('portal.personal_data.manage')
  @Get('me')
  @ApiOperation({ summary: 'Mis datos', description: 'Lo que la plataforma guarda de usted.' })
  @ZodResponse({ status: HttpStatus.OK, type: PortalMyDataResponse, description: 'Sus datos' })
  async myData(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalMyDataResponse> {
    return this.people.myData({ principal, ability });
  }

  @RequirePermission('portal.personal_data.manage')
  @Put('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Corregir mis datos', description: 'Su nombre.' })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiPortalWriteErrors()
  async updateMyData(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePortalMyDataRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.people.updateMyData({ principal, ability, meta }, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('portal.personal_data.manage')
  @Post('me/export')
  @ApiOperation({
    summary: 'Descargar mis datos',
    description: 'Copia de lo que la plataforma guarda de usted; la descarga queda registrada.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PortalDataExportResponse, description: 'Copia' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
  ): Promise<PortalDataExportResponse> {
    return this.people.export({ principal, ability, meta });
  }

  @RequirePermission('portal.user.manage')
  @Get('users')
  @ApiOperation({
    summary: 'Usuarios de mi empresa',
    description: 'Solo el administrador del cliente; con los proyectos que se pueden asignar.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalUserListResponse, description: 'Usuarios' })
  async users(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalUserListResponse> {
    return this.people.users({ principal, ability });
  }

  @RequirePermission('portal.user.manage')
  @Post('users')
  @ApiOperation({
    summary: 'Invitar a una persona de mi empresa',
    description: 'Recibe un enlace de un solo uso que vence en 72 horas.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PortalCreatedResponse, description: 'Invitada' })
  @ApiPortalWriteErrors()
  async invite(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: InvitePortalUserRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PortalCreatedResponse> {
    return { id: await this.people.invite({ principal, ability, meta }, body) };
  }

  @RequirePermission('portal.user.manage')
  @Put('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cambiar el rol o desactivar',
    description: 'Desactivar cierra todas sus sesiones. Nadie cambia su propia cuenta.',
  })
  @ApiHeader(IF_MATCH)
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiPortalWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdatePortalUserRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { userId: id, version: versionFromIfMatch(ifMatch) };
    await this.people.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('portal.user.manage')
  @Put('users/:id/projects')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Proyectos que ve un usuario',
    description: 'Solo proyectos de su empresa. El administrador ve todos.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiPortalWriteErrors()
  async assignProjects(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: PortalUserProjectsRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.people.assignProjects({ principal, ability, meta }, id, body.project_ids);
  }
}
