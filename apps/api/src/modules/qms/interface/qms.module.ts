import { Module } from '@nestjs/common';

import { ActionSteps } from '../application/action-steps.js';
import { Actions } from '../application/actions.js';
import { OrganizationContext } from '../application/context.js';
import { Lessons } from '../application/lessons.js';
import { Nonconformities } from '../application/nonconformities.js';
import { NonconformitySteps } from '../application/nonconformity-steps.js';
import { Processes } from '../application/processes.js';
import { Risks } from '../application/risks.js';
import { ActionsController } from './actions.controller.js';
import { MyQualityController } from './my-quality.controller.js';
import { NonconformitiesController } from './nonconformities.controller.js';
import { OrganizationController } from './organization.controller.js';
import { RisksController } from './risks.controller.js';

// Calidad y mejora continua (M14, B38).

@Module({
  controllers: [
    OrganizationController,
    RisksController,
    NonconformitiesController,
    ActionsController,
    MyQualityController,
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
  ],
})
export class QmsModule {}
