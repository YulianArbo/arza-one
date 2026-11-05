import { Module, type OnModuleInit } from '@nestjs/common';

import { ItemQueries } from '../application/item-queries.js';
import { ItemsUseCase } from '../application/items.js';
import { MembersUseCase } from '../application/members.js';
import { PlanningUseCase } from '../application/planning.js';
import { ProjectQueries } from '../application/project-queries.js';
import { followProjectWorkflows } from '../application/project-seed.js';
import { ProjectsUseCase } from '../application/projects.js';
import { SprintsUseCase } from '../application/sprints.js';
import { ProjectTeamController } from './project-team.controller.js';
import { ProjectWorkController } from './project-work.controller.js';
import { ProjectsController } from './projects.controller.js';

/**
 * M07 Proyectos (B26): proyectos creados desde un contrato vigente o con la autorización expresa de
 * la Dirección, su equipo, hitos con porcentaje de facturación, iteraciones, lista de pendientes y
 * tablero de trabajo, y enlaces al repositorio, a los entornos y al diseño. Cada miembro del equipo
 * ve solo sus proyectos. Horas, entregables, actas, riesgos y liberaciones llegan con el B27.
 */
@Module({
  controllers: [ProjectsController, ProjectTeamController, ProjectWorkController],
  providers: [
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
