import { Module, type OnModuleInit } from '@nestjs/common';

import { CompensationsUseCase } from '../application/compensations.js';
import { KnowledgeUseCase } from '../application/knowledge.js';
import { PqrsfIntakeUseCase } from '../application/pqrsf-intake.js';
import { PqrsfQueries } from '../application/pqrsf-queries.js';
import { PqrsfStepsUseCase } from '../application/pqrsf-steps.js';
import { SlaPoliciesUseCase } from '../application/sla-policies.js';
import { TicketMessagesUseCase } from '../application/ticket-messages.js';
import { TicketQueries } from '../application/ticket-queries.js';
import { TicketStepsUseCase } from '../application/ticket-steps.js';
import { SurveyPublicUseCase } from '../application/survey-public.js';
import { SurveysUseCase } from '../application/surveys.js';
import { TicketsUseCase } from '../application/tickets.js';
import { followAcceptedDeliverables, WarrantiesUseCase } from '../application/warranties.js';
import { KnowledgeController } from './knowledge.controller.js';
import { PqrsfResponseController } from './pqrsf-response.controller.js';
import { PqrsfController } from './pqrsf.controller.js';
import { PublicCareController } from './public-care.controller.js';
import { ServiceSettingsController } from './service-settings.controller.js';
import { SurveysController } from './surveys.controller.js';
import { TicketRecordsController } from './ticket-records.controller.js';
import { TicketsController } from './tickets.controller.js';

/**
 * M08 Servicio al cliente. B28, mesa de ayuda: tiquetes con niveles, prioridades y acuerdos de
 * tiempo cuyo reloj se pausa en espera del cliente; alerta al 80 % del plazo; escalamiento;
 * conversación con mensajes públicos y notas internas; garantías por entregable aceptado y
 * compensaciones técnicas RE-SAC-001. B29: PQRSF con radicado, plazo en días hábiles y respuesta
 * aprobada; encuestas de satisfacción y NPS; base de conocimiento.
 */
@Module({
  controllers: [
    TicketsController,
    TicketRecordsController,
    ServiceSettingsController,
    PqrsfController,
    PqrsfResponseController,
    SurveysController,
    KnowledgeController,
    PublicCareController,
  ],
  providers: [
    PqrsfQueries,
    PqrsfIntakeUseCase,
    PqrsfStepsUseCase,
    SurveysUseCase,
    SurveyPublicUseCase,
    KnowledgeUseCase,
    TicketQueries,
    TicketsUseCase,
    TicketStepsUseCase,
    TicketMessagesUseCase,
    CompensationsUseCase,
    SlaPoliciesUseCase,
    WarrantiesUseCase,
  ],
})
export class ServiceModule implements OnModuleInit {
  onModuleInit(): void {
    followAcceptedDeliverables();
  }
}
