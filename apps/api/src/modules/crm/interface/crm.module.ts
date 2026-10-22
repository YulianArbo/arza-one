import { Module, type OnModuleInit } from '@nestjs/common';

import { ActivitiesUseCase } from '../application/activities.js';
import { CampaignsUseCase } from '../application/campaigns.js';
import { followCrmWorkflows } from '../application/crm-workflows.js';
import { FunnelReportUseCase } from '../application/funnel-report.js';
import { LeadQueries } from '../application/lead-queries.js';
import { LeadsUseCase } from '../application/leads.js';
import { OpportunitiesUseCase } from '../application/opportunities.js';
import { OpportunityQueries } from '../application/opportunity-queries.js';
import { ActivitiesController } from './activities.controller.js';
import { CampaignsController, FunnelReportController } from './campaigns-and-funnel.controller.js';
import { LeadsController } from './leads.controller.js';
import { OpportunitiesController } from './opportunities.controller.js';

/**
 * M05 Comercial, CRM (B22): prospectos con su autorización y su tarea de contacto, embudo de
 * oportunidades, actividades con recordatorio, campañas e informe del embudo (RE-COM-001).
 */
@Module({
  controllers: [
    LeadsController,
    OpportunitiesController,
    ActivitiesController,
    CampaignsController,
    FunnelReportController,
  ],
  providers: [
    LeadQueries,
    LeadsUseCase,
    OpportunityQueries,
    OpportunitiesUseCase,
    ActivitiesUseCase,
    CampaignsUseCase,
    FunnelReportUseCase,
  ],
})
export class CrmModule implements OnModuleInit {
  onModuleInit(): void {
    followCrmWorkflows();
  }
}
