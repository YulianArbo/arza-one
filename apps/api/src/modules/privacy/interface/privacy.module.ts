import { Global, Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { ActivitiesUseCase } from '../application/activities.js';
import { ConsentsUseCase } from '../application/consents.js';
import { IncidentsUseCase } from '../application/incidents.js';
import { NoticesUseCase } from '../application/notices.js';
import { PersonalDataUseCase } from '../application/personal-data.js';
import { PersonalDataRegistry } from '../application/personal-data-sources.js';
import { PrivacyReportsUseCase } from '../application/privacy-reports.js';
import { ProcessorsUseCase } from '../application/processors.js';
import { PublicRequestsUseCase } from '../application/request-public.js';
import { RequestStepsUseCase } from '../application/request-steps.js';
import { RequestsUseCase } from '../application/requests.js';
import { ConsentsController } from './consents.controller.js';
import { CookieConsentsController, PrivacyIncidentsController } from './incidents.controller.js';
import { NoticesController } from './notices.controller.js';
import { PersonalDataController } from './personal-data.controller.js';
import {
  PortalPrivacyRequestsController,
  PublicPrivacyRequestsController,
} from './public-requests.controller.js';
import { ActivitiesController, ProcessorsController } from './register.controller.js';
import { PrivacyRequestsController } from './requests.controller.js';

/**
 * El registro donde cada módulo pone la fuente de los datos personales que guarda (B42). Es global
 * porque los módulos que registran su fuente no importan el módulo de privacidad.
 */
@Global()
@Module({ providers: [PersonalDataRegistry], exports: [PersonalDataRegistry] })
class PersonalDataModule {}

/**
 * M18 Privacidad (B17 y B42): avisos y políticas versionados, autorizaciones de tratamiento con la
 * versión aceptada, registro de actividades de tratamiento y encargados, solicitudes de titulares
 * con sus plazos legales, entrega y supresión de datos, incidentes y elecciones de cookies. Los
 * terceros los presta el módulo de terceros por el puerto PARTY_DIRECTORY.
 */
@Module({
  imports: [DocModule, PersonalDataModule],
  controllers: [
    NoticesController,
    ConsentsController,
    ActivitiesController,
    ProcessorsController,
    PrivacyRequestsController,
    PublicPrivacyRequestsController,
    PortalPrivacyRequestsController,
    PersonalDataController,
    PrivacyIncidentsController,
    CookieConsentsController,
  ],
  providers: [
    NoticesUseCase,
    ConsentsUseCase,
    ActivitiesUseCase,
    ProcessorsUseCase,
    RequestsUseCase,
    RequestStepsUseCase,
    PublicRequestsUseCase,
    PersonalDataUseCase,
    IncidentsUseCase,
    PrivacyReportsUseCase,
  ],
})
export class PrivacyModule {}
