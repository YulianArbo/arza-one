import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  acceptInvitationRequestSchema,
  acknowledgementResponseSchema,
  errorResponseSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  reauthenticateRequestSchema,
  resetPasswordRequestSchema,
  secondFactorConfirmRequestSchema,
  secondFactorConfirmResponseSchema,
  secondFactorRequestSchema,
  secondFactorSetupResponseSchema,
  sessionResponseSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Authenticated, Public, SigningIn } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { FORGOT_PASSWORD_MESSAGE } from '../application/iam-messages.js';
import { InvitationUseCase } from '../application/invitation.js';
import { LoginUseCase, type StartedSession } from '../application/login.js';
import { PasswordResetUseCase } from '../application/password-reset.js';
import { ReauthenticationUseCase } from '../application/reauthentication.js';
import { SecondFactorSetupUseCase } from '../application/second-factor-setup.js';
import { SecondFactorSignInUseCase } from '../application/second-factor-sign-in.js';
import { SessionService } from '../application/session-service.js';
import {
  clearSessionCookie,
  DeviceToken,
  setDeviceCookie,
  setSessionCookie,
  toSessionResponse,
} from './session-http.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class LoginRequest extends createZodDto(loginRequestSchema) {}
class ForgotPasswordRequest extends createZodDto(forgotPasswordRequestSchema) {}
class ResetPasswordRequest extends createZodDto(resetPasswordRequestSchema) {}
class AcceptInvitationRequest extends createZodDto(acceptInvitationRequestSchema) {}
class SecondFactorRequest extends createZodDto(secondFactorRequestSchema) {}
class SecondFactorSetupResponse extends createZodDto(secondFactorSetupResponseSchema) {}
class SecondFactorConfirmRequest extends createZodDto(secondFactorConfirmRequestSchema) {}
class SecondFactorConfirmResponse extends createZodDto(secondFactorConfirmResponseSchema) {}
class ReauthenticateRequest extends createZodDto(reauthenticateRequestSchema) {}
class SessionResponse extends createZodDto(sessionResponseSchema) {}
class AcknowledgementResponse extends createZodDto(acknowledgementResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/** Límite más estricto para las rutas de acceso (numeral 13.1, paso 3): 10 por minuto por IP. */
const ACCESS_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/** Entrega las cookies de una sesión iniciada o completada. */
function deliverSession(response: Response, started: StartedSession): void {
  setSessionCookie(response, started.token, started.view.expiresAt);
  if (started.deviceToken !== null) setDeviceCookie(response, started.deviceToken);
}

@ApiTags('Identidad')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PasswordResetUseCase) private readonly passwordReset: PasswordResetUseCase,
    @Inject(InvitationUseCase) private readonly invitation: InvitationUseCase,
    @Inject(SecondFactorSignInUseCase) private readonly secondFactor: SecondFactorSignInUseCase,
    @Inject(SecondFactorSetupUseCase) private readonly setup: SecondFactorSetupUseCase,
    @Inject(ReauthenticationUseCase) private readonly reauthentication: ReauthenticationUseCase,
  ) {}

  @Public()
  @Throttle(ACCESS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con correo y contraseña',
    description:
      'Si la cuenta tiene o debe tener segundo factor, la sesión queda a medias (etapa second_factor o second_factor_setup) durante 10 minutos.',
  })
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
    @DeviceToken() deviceToken: string | null,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const started = await this.login.execute(body, meta, deviceToken);
    deliverSession(response, started);
    return toSessionResponse(started.view);
  }

  @SigningIn()
  @Throttle(ACCESS_THROTTLE)
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Segundo paso: código de la aplicación o código de recuperación',
    description: 'Al acertar, la sesión se completa y recibe una llave nueva.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: SessionResponse, description: 'Sesión completa' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Código incorrecto, usado o vencido',
  })
  @ApiCommonErrors()
  async verifySecondFactor(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SecondFactorRequest,
    @Meta() meta: RequestMeta,
    @DeviceToken() deviceToken: string | null,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const started = await this.secondFactor.execute(principal, body, meta, deviceToken);
    deliverSession(response, started);
    return toSessionResponse(started.view);
  }

  @SigningIn()
  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Empezar a configurar el segundo factor: secreto y código QR',
    description:
      'Al iniciar sesión si la cuenta aún no lo tiene; desde el perfil, con la identidad confirmada en los últimos 30 minutos.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: SecondFactorSetupResponse,
    description: 'Secreto para la aplicación del celular',
  })
  @ApiCommonErrors()
  async startSetup(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<SecondFactorSetupResponse> {
    const started = await this.setup.start(principal, meta);
    return {
      secret: started.secret,
      otpauth_uri: started.otpauthUri,
      expires_at: started.expiresAt.toISOString(),
    };
  }

  @SigningIn()
  @Throttle(ACCESS_THROTTLE)
  @Post('mfa/setup/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar el segundo factor con el primer código' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: SecondFactorConfirmResponse,
    description: 'Segundo factor activo y diez códigos de recuperación (se muestran una vez)',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Código incorrecto o configuración vencida',
  })
  @ApiCommonErrors()
  async confirmSetup(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SecondFactorConfirmRequest,
    @Meta() meta: RequestMeta,
    @DeviceToken() deviceToken: string | null,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SecondFactorConfirmResponse> {
    const confirmed = await this.setup.confirm(principal, body, meta, deviceToken);
    if (confirmed.sessionToken !== null) {
      deliverSession(response, {
        token: confirmed.sessionToken,
        deviceToken: confirmed.deviceToken,
        view: confirmed.view,
      });
    }
    return {
      recovery_codes: [...confirmed.recoveryCodes],
      session: toSessionResponse(confirmed.view),
    };
  }

  @Authenticated()
  @Throttle(ACCESS_THROTTLE)
  @Post('reauthenticate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirmar que es usted antes de una acción de alto riesgo',
    description: 'Contraseña y, si tiene segundo factor, su código. Vale 30 minutos.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Identidad confirmada' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Contraseña o código incorrectos',
  })
  @ApiCommonErrors()
  async reauthenticate(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ReauthenticateRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.reauthentication.execute(principal, body, meta);
  }

  @SigningIn()
  @Get('session')
  @ApiOperation({ summary: 'Sesión actual, su etapa y su código antifalsificación' })
  @ZodResponse({ status: HttpStatus.OK, type: SessionResponse, description: 'Sesión vigente' })
  @ApiCommonErrors()
  async current(@CurrentPrincipal() principal: Principal): Promise<SessionResponse> {
    return toSessionResponse(await this.sessions.current(principal));
  }

  @SigningIn()
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
