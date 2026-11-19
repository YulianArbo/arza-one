import { Module } from '@nestjs/common';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { IamModule } from '../../iam/index.js';
import { DocModule } from '../../doc/index.js';
import { CandidateStageUseCase } from '../application/candidate-stage.js';
import { CandidateList } from '../application/candidate-list.js';
import { CandidateEvaluations } from '../application/candidate-evaluations.js';
import { CandidateRegistration } from '../application/candidate-registration.js';
import { DisciplinaryCases } from '../application/disciplinary-cases.js';
import { VacanciesUseCase } from '../application/vacancies.js';
import { Hiring } from '../application/hiring.js';
import { EmployeeRecords } from '../application/employee-records.js';
import { EmployeeChecklists } from '../application/employee-checklists.js';
import { LeaveDecisions } from '../application/leave-decisions.js';
import { LeaveRequests } from '../application/leave-requests.js';
import { MySpaceQueries } from '../application/my-space.js';
import { MyTasks } from '../application/my-tasks.js';
import { Offboardings } from '../application/offboardings.js';
import { OvertimeDecisions } from '../application/overtime-decisions.js';
import { OvertimeRequests } from '../application/overtime-requests.js';
import { PayrollNovelties } from '../application/payroll-novelties.js';
import { PayrollPeriods } from '../application/payroll-periods.js';
import { PerformanceReviews } from '../application/performance-reviews.js';
import { Trainings } from '../application/trainings.js';
import { AbsencesController } from './absences.controller.js';
import { CandidateStageController } from './candidate-stage.controller.js';
import { DevelopmentController } from './development.controller.js';
import { DisciplineController } from './discipline.controller.js';
import { EmploymentController } from './employment.controller.js';
import { EmployeeChecklistsController } from './employee-checklists.controller.js';
import { MySpaceController } from './my-space.controller.js';
import { MyTeamController } from './my-team.controller.js';
import { OffboardingController } from './offboarding.controller.js';
import { OvertimeController } from './overtime.controller.js';
import { PayrollController } from './payroll.controller.js';
import { VacanciesController } from './vacancies.controller.js';

@Module({
  imports: [IamModule, DocModule],
  controllers: [
    VacanciesController,
    CandidateStageController,
    EmploymentController,
    EmployeeChecklistsController,
    AbsencesController,
    OvertimeController,
    PayrollController,
    DevelopmentController,
    DisciplineController,
    OffboardingController,
    MyTeamController,
    MySpaceController,
  ],
  providers: [
    VacanciesUseCase,
    CandidateStageUseCase,
    CandidateRegistration,
    CandidateList,
    CandidateEvaluations,
    Hiring,
    EmployeeRecords,
    EmployeeChecklists,
    LeaveRequests,
    LeaveDecisions,
    OvertimeRequests,
    OvertimeDecisions,
    PayrollNovelties,
    PayrollPeriods,
    PerformanceReviews,
    Trainings,
    DisciplinaryCases,
    Offboardings,
    MyTasks,
    MySpaceQueries,
    // Los textos del proceso disciplinario se cifran con FIELD_ENCRYPTION_KEY (numeral 12.4).
    {
      provide: FieldCipher,
      useFactory: (config: Env) => new FieldCipher(config.FIELD_ENCRYPTION_KEY),
      inject: [CONFIG],
    },
  ],
})
export class HrModule {}
