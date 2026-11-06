import { Module, type OnModuleInit } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';

import { ClosingUseCase } from '../application/closing.js';
import { CodeReviewsUseCase } from '../application/code-reviews.js';
import { ControlQueries } from '../application/control-queries.js';
import { DeliverablesUseCase } from '../application/deliverables.js';
import { DeliveryQueries } from '../application/delivery-queries.js';
import { IncidentsUseCase } from '../application/incidents.js';
import { ItemQueries } from '../application/item-queries.js';
import { ItemsUseCase } from '../application/items.js';
import { MembersUseCase } from '../application/members.js';
import { PlanningUseCase } from '../application/planning.js';
import { ProjectQueries } from '../application/project-queries.js';
import { followProjectWorkflows } from '../application/project-seed.js';
import { ProjectsUseCase } from '../application/projects.js';
import { RisksReleasesUseCase } from '../application/risks-releases.js';
import { SprintsUseCase } from '../application/sprints.js';
import { TimeEntriesUseCase } from '../application/time-entries.js';
import { TimeQueries } from '../application/time-queries.js';
import { ProjectControlController } from './project-control.controller.js';
import { ProjectDeliveryController } from './project-delivery.controller.js';
import { ProjectTeamController } from './project-team.controller.js';
import { MyTimeController, ProjectTimeController } from './project-time.controller.js';
import { ProjectWorkController } from './project-work.controller.js';
import { ProjectsController } from './projects.controller.js';

/**
 * M07 Proyectos (B26): proyectos creados desde un contrato vigente o con la autorización expresa de
 * la Dirección, su equipo, hitos con porcentaje de facturación, iteraciones, lista de pendientes y
 * tablero de trabajo, y enlaces al repositorio, a los entornos y al diseño. Cada miembro del equipo
 * ve solo sus proyectos. Desde el B27: horas, entregables con su acta FT-TEC-001 firmada por el
 * cliente, revisiones de código FT-TEC-002, riesgos, liberaciones, incidentes, indicadores de
 * avance, desviación y rentabilidad, y el cierre.
 */
@Module({
  imports: [DocModule],
  controllers: [
    ProjectsController,
    ProjectTeamController,
    ProjectWorkController,
    ProjectTimeController,
    MyTimeController,
    ProjectDeliveryController,
    ProjectControlController,
  ],
  providers: [
    TimeEntriesUseCase,
    TimeQueries,
    DeliverablesUseCase,
    DeliveryQueries,
    CodeReviewsUseCase,
    RisksReleasesUseCase,
    IncidentsUseCase,
    ClosingUseCase,
    ControlQueries,
    ProjectQueries,
    ProjectsUseCase,
    MembersUseCase,
    PlanningUseCase,
    SprintsUseCase,
    ItemsUseCase,
    ItemQueries,
  ],
})
export class ProjectModule implements OnModuleInit {
  onModuleInit(): void {
    followProjectWorkflows();
  }
}
