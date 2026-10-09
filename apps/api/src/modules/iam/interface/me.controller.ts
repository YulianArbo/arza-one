import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  changePasswordRequestSchema,
  errorResponseSchema,
  meResponseSchema,
  myPermissionsResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { OwnAccount } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { AccessControlService } from '../application/access-control.js';
import { ChangePasswordUseCase } from '../application/change-password.js';
import { ProfileQuery } from '../application/profile.js';
import { clearSessionCookie } from './session-http.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class MeResponse extends createZodDto(meResponseSchema) {}
class MyPermissionsResponse extends createZodDto(myPermissionsResponseSchema) {}
class ChangePasswordRequest extends createZodDto(changePasswordRequestSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/** Perfil propio (numeral 14.3, «me»): cada persona solo ve y cambia lo suyo. */
@ApiTags('Identidad')
@Controller('v1/me')
@OwnAccount()
export class MeController {
  constructor(
    @Inject(ProfileQuery) private readonly profile: ProfileQuery,
    @Inject(ChangePasswordUseCase) private readonly changePassword: ChangePasswordUseCase,
    @Inject(AccessControlService) private readonly access: AccessControlService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Mi perfil' })
  @ZodResponse({ status: HttpStatus.OK, type: MeResponse, description: 'Datos del perfil propio' })
  @ApiCommonErrors()
  async me(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return this.profile.execute(principal);
  }

  @Get('permissions')
  @ApiOperation({
    summary: 'Mis roles y permisos vigentes',
    description: 'La web los usa para mostrar u ocultar; la API los revisa igual en cada petición.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: MyPermissionsResponse, description: 'Permisos' })
  @ApiCommonErrors()
  async permissions(@CurrentPrincipal() principal: Principal): Promise<MyPermissionsResponse> {
    return this.access.mine(principal);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar mi contraseña; cierra todas mis sesiones' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Contraseña cambiada' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Contraseña actual incorrecta o contraseña nueva que no cumple las reglas',
  })
  @ApiCommonErrors()
  async password(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ChangePasswordRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.changePassword.execute(principal, body, meta);
    clearSessionCookie(response);
  }
}
