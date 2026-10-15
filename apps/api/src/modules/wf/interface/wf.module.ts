import { Module } from '@nestjs/common';

import { DefinitionsUseCase } from '../application/definitions.js';
import { InstancesUseCase } from '../application/instances.js';
import { TaskActionsUseCase } from '../application/task-actions.js';
import { TaskQueriesUseCase } from '../application/task-queries.js';
import { InstancesController } from './instances.controller.js';
import { TasksController } from './tasks.controller.js';
import { WorkflowsController } from './workflows.controller.js';

/**
 * M04 Flujos y tareas (B15): definiciones versionadas que interpreta un solo motor, bandeja «Mis
 * tareas», aprobaciones en serie y en paralelo, delegación y escalamiento por vencimiento.
 */
@Module({
  controllers: [WorkflowsController, TasksController, InstancesController],
  providers: [DefinitionsUseCase, InstancesUseCase, TaskActionsUseCase, TaskQueriesUseCase],
})
export class WfModule {}
