import { Module } from '@nestjs/common';

import { ActivitiesUseCase } from '../application/activities.js';
import { ConsentsUseCase } from '../application/consents.js';
import { NoticesUseCase } from '../application/notices.js';
import { ProcessorsUseCase } from '../application/processors.js';
import { ConsentsController } from './consents.controller.js';
import { NoticesController } from './notices.controller.js';
import { ActivitiesController, ProcessorsController } from './register.controller.js';

/**
 * M18 Privacidad (B17): avisos y políticas versionados, autorizaciones de tratamiento con la
 * versión aceptada, registro de actividades de tratamiento y encargados. Los terceros los presta
 * el módulo de terceros por el puerto PARTY_DIRECTORY.
 */
@Module({
  controllers: [NoticesController, ConsentsController, ActivitiesController, ProcessorsController],
  providers: [NoticesUseCase, ConsentsUseCase, ActivitiesUseCase, ProcessorsUseCase],
})
export class PrivacyModule {}
