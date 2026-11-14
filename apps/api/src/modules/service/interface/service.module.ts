import { Module, type OnModuleInit } from '@nestjs/common';

import { CompensationsUseCase } from '../application/compensations.js';
import { SlaPoliciesUseCase } from '../application/sla-policies.js';
import { TicketMessagesUseCase } from '../application/ticket-messages.js';
import { TicketQueries } from '../application/ticket-queries.js';
import { TicketStepsUseCase } from '../application/ticket-steps.js';
import { TicketsUseCase } from '../application/tickets.js';
import { followAcceptedDeliverables, WarrantiesUseCase } from '../application/warranties.js';
import { ServiceSettingsController } from './service-settings.controller.js';
import { TicketRecordsController } from './ticket-records.controller.js';
import { TicketsController } from './tickets.controller.js';

/**
 * M08 Servicio al cliente (B28): mesa de ayuda. Tiquetes con niveles, prioridades y acuerdos de
 * tiempo cuyo reloj se pausa en espera del cliente; alerta al 80 % del plazo; escalamiento;
 * conversación con mensajes públicos y notas internas; garantías por entregable aceptado y
 * compensaciones técnicas RE-SAC-001.
 */
@Module({
  controllers: [TicketsController, TicketRecordsController, ServiceSettingsController],
  providers: [
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
