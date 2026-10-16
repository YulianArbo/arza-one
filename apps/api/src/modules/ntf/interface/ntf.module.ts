import { Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { AttachmentsUseCase } from '../application/attachments.js';
import { CommentsUseCase } from '../application/comments.js';
import { NotificationsUseCase } from '../application/notifications.js';
import { TemplatesUseCase } from '../application/templates.js';
import { AttachmentsController } from './attachments.controller.js';
import { CommentsController } from './comments.controller.js';
import { MyNotificationsController } from './my-notifications.controller.js';
import { NotificationTemplatesController } from './notification-templates.controller.js';

/**
 * M04 Avisos, comentarios y adjuntos (B16): centro de avisos, plantillas institucionales de
 * correo, preferencias, envío diferido fuera de jornada, y comentarios con menciones y adjuntos
 * en cualquier registro. El worker publica la bandeja de salida y envía los correos.
 */
@Module({
  imports: [DocModule],
  controllers: [
    MyNotificationsController,
    NotificationTemplatesController,
    CommentsController,
    AttachmentsController,
  ],
  providers: [NotificationsUseCase, TemplatesUseCase, CommentsUseCase, AttachmentsUseCase],
})
export class NtfModule {}
