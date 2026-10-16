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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
  updateNotificationPreferencesRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { OwnAccount } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { NotificationsUseCase } from '../application/notifications.js';
import { ApiNtfWriteErrors } from './ntf-openapi.js';

class NotificationListQuery extends createZodDto(notificationListQuerySchema) {}
class NotificationListResponse extends createZodDto(notificationListResponseSchema) {}
class NotificationPreferencesResponse extends createZodDto(notificationPreferencesSchema) {}
class UpdateNotificationPreferencesRequest extends createZodDto(
  updateNotificationPreferencesRequestSchema,
) {}

const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' } as const;

/**
 * Centro de avisos y preferencias de la persona (B16, ficha 17.5). Cada quien ve y cambia solo lo
 * suyo, como el resto de /v1/me.
 */
@ApiTags('Avisos')
@Controller('v1/me')
@OwnAccount()
@ApiCommonErrors()
export class MyNotificationsController {
  constructor(@Inject(NotificationsUseCase) private readonly notifications: NotificationsUseCase) {}

  @Get('notifications')
  @ApiOperation({
    summary: 'Mis avisos',
    description: 'Los más recientes primero. Un aviso diferido aparece al iniciar la jornada.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: NotificationListResponse, description: 'Avisos' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(principal, query);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar todos mis avisos como leídos' })
  @ApiResponse(DONE)
  async readAll(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.notifications.markAllRead(principal, meta);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar un aviso como leído' })
  @ApiResponse(DONE)
  @ApiNtfWriteErrors()
  async read(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.notifications.markRead(principal, id, meta);
  }

  @Get('notification-preferences')
  @ApiOperation({ summary: 'Mis preferencias de aviso' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: NotificationPreferencesResponse,
    description: 'Preferencias',
  })
  async preferences(
    @CurrentPrincipal() principal: Principal,
  ): Promise<NotificationPreferencesResponse> {
    return this.notifications.preferences(principal);
  }

  @Put('notification-preferences')
  @ApiOperation({
    summary: 'Cambiar mis preferencias de aviso',
    description: 'Los avisos urgentes llegan siempre por correo.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: NotificationPreferencesResponse,
    description: 'Preferencias',
  })
  @ApiNtfWriteErrors()
  async updatePreferences(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdateNotificationPreferencesRequest,
    @Meta() meta: RequestMeta,
  ): Promise<NotificationPreferencesResponse> {
    return this.notifications.updatePreferences(principal, body, meta);
  }
}
