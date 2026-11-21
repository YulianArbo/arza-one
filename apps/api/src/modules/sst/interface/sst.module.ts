import { Module } from '@nestjs/common';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { Committees } from '../application/committees.js';
import { Complaints } from '../application/complaints.js';
import { Hazards } from '../application/hazards.js';
import { Incidents } from '../application/incidents.js';
import { Inspections } from '../application/inspections.js';
import { MedicalExams } from '../application/medical-exams.js';
import { MySstQueries } from '../application/my-sst.js';
import { PpeDeliveries } from '../application/ppe.js';
import { QuickReports } from '../application/quick-reports.js';
import { Standards } from '../application/standards.js';
import { UnsafeReports } from '../application/unsafe-reports.js';
import { WorkPlan } from '../application/work-plan.js';
import { CommitteesController } from './committees.controller.js';
import { HealthController } from './health.controller.js';
import { IncidentsController } from './incidents.controller.js';
import { InspectionsController } from './inspections.controller.js';
import { MySstController } from './my-sst.controller.js';
import { PlanningController } from './planning.controller.js';
import { StandardsController } from './standards.controller.js';

// Seguridad y salud en el trabajo (M13, B37).

@Module({
  controllers: [
    PlanningController,
    IncidentsController,
    InspectionsController,
    HealthController,
    CommitteesController,
    StandardsController,
    MySstController,
  ],
  providers: [
    Hazards,
    WorkPlan,
    QuickReports,
    UnsafeReports,
    Incidents,
    Inspections,
    MedicalExams,
    PpeDeliveries,
    Committees,
    Complaints,
    Standards,
    MySstQueries,
    // Las restricciones médicas, las actas y las quejas de convivencia se cifran con
    // FIELD_ENCRYPTION_KEY (numeral 12.4).
    {
      provide: FieldCipher,
      useFactory: (config: Env) => new FieldCipher(config.FIELD_ENCRYPTION_KEY),
      inject: [CONFIG],
    },
  ],
})
export class SstModule {}
