import {
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
import {
  activeSessionsResponseSchema,
  closedSessionsResponseSchema,
  errorResponseSchema,
  recoveryCodesResponseSchema,
  secondFactorStatusResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Authenticated, RecentAuthentication } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { ActiveSessionsUseCase } from '../application/active-sessions.js';
import { SecondFactorSettings } from '../application/second-factor-settings.js';

// El nombre de la clase es el nombre del esquema en el OpenAPI.
class SecondFactorStatusResponse extends createZodDto(secondFactorStatusResponseSchema) {}
class RecoveryCodesResponse extends createZodDto(recoveryCodesResponseSchema) {}
class ActiveSessionsResponse extends createZodDto(activeSessionsResponseSchema) {}
class ClosedSessionsResponse extends createZodDto(closedSessionsResponseSchema) {}
class ErrorResponse extends createZodDto(errorResponseSchema) {}

/**
 * Seguridad de la cuenta propia (B09): segundo factor y sesiones activas. Cada persona solo ve y
 * cambia lo suyo. Las acciones de alto riesgo piden confirmar la identidad (numeral 15.1).
 */
@ApiTags('Identidad')
@Controller('v1/me')
@Authenticated()
export class MeSecurityController {
  constructor(
    @Inject(SecondFactorSettings) private readonly secondFactor: SecondFactorSettings,
    @Inject(ActiveSessionsUseCase) private readonly sessions: ActiveSessionsUseCase,
  ) {}

  @Get('mfa')
  @ApiOperation({ summary: 'Estado de mi segundo factor' })
  @ZodResponse({ status: HttpStatus.OK, type: SecondFactorStatusResponse, description: 'Estado' })
  @ApiCommonErrors()
  async status(@CurrentPrincipal() principal: Principal): Promise<SecondFactorStatusResponse> {
    return this.secondFactor.status(principal);
  }

  @RecentAuthentication()
  @Post('mfa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generar diez códigos de recuperación nuevos',
    description: 'Los anteriores dejan de servir. Exige confirmar la identidad (30 minutos).',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: RecoveryCodesResponse,
    description: 'Códigos nuevos; se muestran una sola vez',
  })
  @ApiCommonErrors()
  async regenerateRecoveryCodes(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<RecoveryCodesResponse> {
    return { recovery_codes: await this.secondFactor.regenerateRecoveryCodes(principal, meta) };
  }

  @RecentAuthentication()
  @Post('mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desactivar mi segundo factor (solo si es opcional para mí)',
    description: 'Cierra mis demás sesiones. Exige confirmar la identidad (30 minutos).',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Segundo factor desactivado' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponse.Output,
    description: 'Su tipo de usuario exige segundo factor',
  })
  @ApiCommonErrors()
  async disable(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.secondFactor.disable(principal, meta);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Mis sesiones activas' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: ActiveSessionsResponse,
    description: 'Sesiones abiertas, la más reciente primero',
  })
  @ApiCommonErrors()
  async listSessions(@CurrentPrincipal() principal: Principal): Promise<ActiveSessionsResponse> {
    return { data: await this.sessions.list(principal) };
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar todas mis demás sesiones' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: ClosedSessionsResponse,
    description: 'Cuántas sesiones se cerraron',
  })
  @ApiCommonErrors()
  async revokeOthers(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<ClosedSessionsResponse> {
    return { closed: await this.sessions.revokeOthers(principal, meta) };
  }

  @Post('sessions/:id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cerrar una de mis sesiones',
    description: 'Surte efecto en la siguiente petición de ese equipo.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Sesión cerrada' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponse.Output,
    description: 'No existe, ya está cerrada o no es suya',
  })
  @ApiCommonErrors()
  async revokeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.sessions.revoke(principal, sessionId, meta);
  }
}
