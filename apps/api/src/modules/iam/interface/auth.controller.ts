import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInvitationRequestSchema,
  acknowledgementResponseSchema,
  errorResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  sessionResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Authenticated, Public } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { FORGOT_PASSWORD_MESSAGE } from '../application/iam-messages.js';
import { InvitationUseCase } from '../application/invitation.js';
import { LoginUseCase } from '../application/login.js';
import { PasswordResetUseCase } from '../application/password-reset.js';
import { SessionService } from '../application/session-service.js';
import { clearSessionCookie, setSessionCookie, toSessionResponse } from './session-http.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class LoginRequest extends createZodDto(loginRequestSchema) {}
class ForgotPasswordRequest extends createZodDto(forgotPasswordRequestSchema) {}
class ResetPasswordRequest extends createZodDto(resetPasswordRequestSchema) {}
class AcceptInvitationRequest extends createZodDto(acceptInvitationRequestSchema) {}
class SessionResponse extends createZodDto(sessionResponseSchema) {}
class AcknowledgementResponse extends createZodDto(acknowledgementResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/** Límite más estricto para las rutas de acceso (numeral 13.1, paso 3): 10 por minuto por IP. */
const ACCESS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Identidad')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PasswordResetUseCase) private readonly passwordReset: PasswordResetUseCase,
    @Inject(InvitationUseCase) private readonly invitation: InvitationUseCase,
  ) {}

  @Public()
  @Throttle(ACCESS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @ZodResponse({ status: HttpStatus.OK, type: SessionResponse, description: 'Sesión iniciada' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: ErrorResponse.Output,
    description: 'Correo o contraseña incorrectos (no dice cuál)',
  })
  @ApiCommonErrors()
  async signIn(
    @Body() body: LoginRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const started = await this.login.execute(body, meta);
    setSessionCookie(response, started.token, started.view.expiresAt);
    return toSessionResponse(started.view);
  }

  @Authenticated()
  @Get('session')
  @ApiOperation({ summary: 'Sesión actual y su código antifalsificación' })
  @ZodResponse({ status: HttpStatus.OK, type: SessionResponse, description: 'Sesión vigente' })
  @ApiCommonErrors()
  async current(@CurrentPrincipal() principal: Principal): Promise<SessionResponse> {
    return toSessionResponse(await this.sessions.current(principal));
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar la sesión actual' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Sesión cerrada' })
  @ApiCommonErrors()
  async signOut(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.logout(principal, meta);
    clearSessionCookie(response);
  }

  @Public()
  @Throttle(ACCESS_THROTTLE)
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Pedir un enlace para crear una contraseña nueva' })
  @ZodResponse({
    status: HttpStatus.ACCEPTED,
    type: AcknowledgementResponse,
    description: 'Siempre la misma respuesta, exista o no la cuenta',
  })
  @ApiCommonErrors()
  async forgot(
    @Body() body: ForgotPasswordRequest,
    @Meta() meta: RequestMeta,
  ): Promise<AcknowledgementResponse> {
    await this.passwordReset.request(body, meta);
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  @Public()
  @Throttle(ACCESS_THROTTLE)
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Crear una contraseña nueva con el enlace del correo' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Contraseña cambiada; sesiones cerradas',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Enlace inválido o vencido, o contraseña que no cumple las reglas',
  })
  @ApiCommonErrors()
  async reset(@Body() body: ResetPasswordRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.passwordReset.complete(body, meta);
  }

  @Public()
  @Throttle(ACCESS_THROTTLE)
  @Post('invitation/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Activar la cuenta con el enlace de la invitación' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cuenta activa' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Enlace inválido o vencido, o contraseña que no cumple las reglas',
  })
  @ApiCommonErrors()
  async accept(@Body() body: AcceptInvitationRequest, @Meta() meta: RequestMeta): Promise<void> {
    await this.invitation.accept(body, meta);
  }
}
