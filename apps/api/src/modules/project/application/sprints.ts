import { Inject, Injectable } from '@nestjs/common';
import type { SprintRequest } from '@arza/contracts';

import type { PrjProject, PrjSprint } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { sprintPeriodProblem } from '../domain/project-rules.js';
import { datesInvalid, projectNotFound, sprintActive, statusInvalid } from './project-messages.js';
import { assertWorking, findProject, lockProject } from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Iteraciones del proyecto (B26, ficha 17.8): planeada → en curso → cerrada. Caben dentro de las
// fechas del proyecto y solo una corre a la vez. Al cerrarla, lo que no se terminó vuelve a la lista
// de pendientes para planearlo de nuevo.

function sprintAudit(sprint: PrjSprint): Record<string, string | null> {
  return {
    name: sprint.name,
    starts_on: toCalendarDate(sprint.startsOn),
    ends_on: toCalendarDate(sprint.endsOn),
    goal: sprint.goal,
    status: sprint.status,
  };
}

export async function findSprint(
  tx: TenantTransaction,
  target: { readonly id: string; readonly projectId: string },
): Promise<PrjSprint> {
  const sprint = await tx.prjSprint.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (sprint === null) throw projectNotFound('La iteración');
  return sprint;
}

function assertPeriod(input: SprintRequest, project: PrjProject): void {
  const problem = sprintPeriodProblem(
    { startsOn: input.starts_on, endsOn: input.ends_on },
    { startsOn: toCalendarDate(project.startsOn), endsOn: toCalendarDate(project.endsOn) },
  );
  if (problem !== null) throw datesInvalid(problem);
}

function sprintData(input: SprintRequest) {
  return {
    name: input.name,
    startsOn: fromCalendarDate(input.starts_on),
    endsOn: fromCalendarDate(input.ends_on),
    goal: input.goal,
  };
}

async function moveSprint(
  tx: TenantTransaction,
  target: ProjectPartTarget,
  data: { readonly status: string; readonly closedAt?: Date },
): Promise<void> {
  const { count } = await tx.prjSprint.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

@Injectable()
export class SprintsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async create(
    principal: Principal,
    projectId: string,
    input: SprintRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      assertPeriod(input, project);
      const sprint = await tx.prjSprint.create({
        data: { tenantId: actor.tenantId, projectId, ...sprintData(input) },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.sprint.create',
        event: 'project.sprint.created',
        entityType: 'prj_sprint',
        entityId: sprint.id,
        changes: { project: project.code, ...sprintAudit(sprint) },
        payload: { project_id: projectId, code: project.code },
      });
      return sprint.id;
    });
  }

  async update(
    principal: Principal,
    target: ProjectPartTarget,
    input: SprintRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const before = await findSprint(tx, target);
      if (before.status === 'closed') throw statusInvalid('Una iteración cerrada ya no cambia.');
      assertPeriod(input, project);
      const { count } = await tx.prjSprint.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: sprintData(input),
      });
      if (count === 0) throw versionConflict();
      const after = await findSprint(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.sprint.update',
        event: 'project.sprint.updated',
        entityType: 'prj_sprint',
        entityId: target.id,
        changes: {
          project: project.code,
          ...changesBetween(sprintAudit(before), sprintAudit(after)),
        },
        payload: { project_id: target.projectId, code: project.code },
      });
    });
  }

  /** Inicia la iteración: el proyecto está en ejecución y no corre otra. */
  async start(principal: Principal, target: ProjectPartTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      assertWorking(project, 'Las iteraciones corren cuando el proyecto está en ejecución.');
      await lockProject(tx, project.id);
      const sprint = await findSprint(tx, target);
      if (sprint.status !== 'planned')
        throw statusInvalid('Solo se inicia una iteración planeada.');
      const running = await tx.prjSprint.count({
        where: { projectId: project.id, status: 'active', deletedAt: null },
      });
      if (running > 0) throw sprintActive();
      await moveSprint(tx, target, { status: 'active' });
      await recordProjectChange(tx, actor, {
        action: 'project.sprint.start',
        event: 'project.sprint.started',
        entityType: 'prj_sprint',
        entityId: sprint.id,
        changes: { project: project.code, ...sprintAudit(sprint), status: ['planned', 'active'] },
        payload: { project_id: project.id, code: project.code },
      });
    });
  }

  /** Cierra la iteración; lo no terminado vuelve a la lista de pendientes. */
  async close(principal: Principal, target: ProjectPartTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const sprint = await findSprint(tx, target);
      if (sprint.status !== 'active') throw statusInvalid('Solo se cierra una iteración en curso.');
      await moveSprint(tx, target, { status: 'closed', closedAt: actor.at });
      const returned = await tx.prjItem.updateMany({
        where: { sprintId: sprint.id, status: { not: 'done' }, deletedAt: null },
        data: { sprintId: null },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.sprint.close',
        event: 'project.sprint.closed',
        entityType: 'prj_sprint',
        entityId: sprint.id,
        changes: {
          project: project.code,
          ...sprintAudit(sprint),
          status: ['active', 'closed'],
          returned_items: returned.count,
        },
        payload: { project_id: project.id, code: project.code },
      });
    });
  }
}
