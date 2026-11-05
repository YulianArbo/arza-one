import { Module, type OnModuleInit } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';

import { ActivitiesUseCase } from '../application/activities.js';
import { CampaignsUseCase } from '../application/campaigns.js';
import { followCrmWorkflows } from '../application/crm-workflows.js';
import { FunnelReportUseCase } from '../application/funnel-report.js';
import { LeadQueries } from '../application/lead-queries.js';
import { LeadsUseCase } from '../application/leads.js';
import { OpportunitiesUseCase } from '../application/opportunities.js';
import { OpportunityQueries } from '../application/opportunity-queries.js';
import { PublicQuotesUseCase } from '../application/quote-public.js';
import { QuoteQueries } from '../application/quote-queries.js';
import { QuotesUseCase } from '../application/quotes.js';
import { ServicesUseCase } from '../application/services.js';
import { ActivitiesController } from './activities.controller.js';
import { CampaignsController, FunnelReportController } from './campaigns-and-funnel.controller.js';
import { LeadsController } from './leads.controller.js';
import { OpportunitiesController } from './opportunities.controller.js';
import { PublicQuotesController } from './public-quotes.controller.js';
import { QuotesController } from './quotes.controller.js';
import { ServicesController } from './services.controller.js';

/**
 * M05 Comercial, CRM (B22): prospectos con su autorización y su tarea de contacto, embudo de
 * oportunidades, actividades con recordatorio, campañas e informe del embudo (RE-COM-001). Desde
 * B23, el portafolio de servicios y las cotizaciones con su aprobación, su PDF FT-COM-001 y su
 * aceptación en línea.
 */
@Module({
  imports: [DocModule],
  controllers: [
    LeadsController,
    OpportunitiesController,
    ActivitiesController,
    CampaignsController,
    FunnelReportController,
    ServicesController,
    QuotesController,
    PublicQuotesController,
  ],
  providers: [
    LeadQueries,
    LeadsUseCase,
    OpportunityQueries,
    OpportunitiesUseCase,
    ActivitiesUseCase,
    CampaignsUseCase,
    FunnelReportUseCase,
    ServicesUseCase,
    QuoteQueries,
    QuotesUseCase,
    PublicQuotesUseCase,
  ],
})
export class CrmModule implements OnModuleInit {
  onModuleInit(): void {
    followCrmWorkflows();
  }
}
