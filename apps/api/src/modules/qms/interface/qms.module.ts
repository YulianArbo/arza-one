import { Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { ActionSteps } from '../application/action-steps.js';
import { Actions } from '../application/actions.js';
import { AuditPrograms } from '../application/audit-programs.js';
import { AuditSteps } from '../application/audit-steps.js';
import { Audits } from '../application/audits.js';
import { OrganizationContext } from '../application/context.js';
import { Indicators } from '../application/indicators.js';
import { Lessons } from '../application/lessons.js';
import { Measurements } from '../application/measurements.js';
import { Nonconformities } from '../application/nonconformities.js';
import { NonconformitySteps } from '../application/nonconformity-steps.js';
import { Processes } from '../application/processes.js';
import { QualityFiles } from '../application/quality-files.js';
import { ReviewSteps } from '../application/review-steps.js';
import { ManagementReviews } from '../application/reviews.js';
import { Risks } from '../application/risks.js';
import { ActionsController } from './actions.controller.js';
import { AuditStepsController } from './audit-steps.controller.js';
import { AuditsController } from './audits.controller.js';
import { IndicatorsController } from './indicators.controller.js';
import { MyQualityController } from './my-quality.controller.js';
import { NonconformitiesController } from './nonconformities.controller.js';
import { OrganizationController } from './organization.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { RisksController } from './risks.controller.js';

// Calidad y mejora continua (M14, B38): auditorías, indicadores y revisión por la dirección (B39).

@Module({
  imports: [DocModule],
  controllers: [
    OrganizationController,
    RisksController,
    NonconformitiesController,
    ActionsController,
    MyQualityController,
    AuditsController,
    AuditStepsController,
    IndicatorsController,
    ReviewsController,
  ],
  providers: [
    Processes,
    OrganizationContext,
    Risks,
    Nonconformities,
    NonconformitySteps,
    Actions,
    ActionSteps,
    Lessons,
    AuditPrograms,
    Audits,
    AuditSteps,
    Indicators,
    Measurements,
    ManagementReviews,
    ReviewSteps,
    QualityFiles,
  ],
})
export class QmsModule {}
