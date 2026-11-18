import { Module } from '@nestjs/common';
import { IamModule } from '../../iam/index.js';
import { DocModule } from '../../doc/index.js';

import { CandidateStageUseCase } from '../application/candidate-stage.js';
import { CandidateList } from '../application/candidate-list.js';
import { CandidateEvaluations } from '../application/candidate-evaluations.js';
import { CandidateRegistration } from '../application/candidate-registration.js';
import { VacanciesUseCase } from '../application/vacancies.js';
import { Hiring } from '../application/hiring.js';
import { EmployeeRecords } from '../application/employee-records.js';
import { CandidateStageController } from './candidate-stage.controller.js';
import { EmploymentController } from './employment.controller.js';
import { EmployeeChecklistsController } from './employee-checklists.controller.js';
import { EmployeeChecklists } from '../application/employee-checklists.js';
import { VacanciesController } from './vacancies.controller.js';

@Module({
  imports: [IamModule, DocModule],
  controllers: [
    VacanciesController,
    CandidateStageController,
    EmploymentController,
    EmployeeChecklistsController,
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
  ],
})
export class HrModule {}
