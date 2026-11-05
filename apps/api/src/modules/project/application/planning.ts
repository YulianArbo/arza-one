import { Inject, Injectable } from '@nestjs/common';
import type { LinkRequest, MilestoneRequest } from '@arza/contracts';

import type { PrjMilestone } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { billingExceeds } from '../domain/project-rules.js';
import { billingExceeded, projectNotFound, statusInvalid } from './project-messages.js';
import { findProject, lockProject } from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Hitos y enlaces del proyecto (B26, ficha 17.8). Cada hito dice qué porcentaje del valor se factura
// al cumplirlo; entre todos, como máximo el 100 %. Los entregables y las actas de cada hito llegan
// con el B27. Los enlaces llevan al repositorio, a los entornos y al diseño: el código vive allá.

function milestoneAudit(milestone: PrjMilestone): Record<string, string> {
  return {
    name: milestone.name,
    due_on: toCalendarDate(milestone.dueOn),
    billing_pct: milestone.billingPct.toFixed(2),
    status: milestone.status,
  };
}

async function findMilestone(
  tx: TenantTransaction,
  target: { readonly id: string; readonly projectId: string },
): Promise<PrjMilestone> {
  const milestone = await tx.prjMilestone.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (milestone === null) throw projectNotFound('El hito');
  return milestone;
}

/** Entre todos los hitos del proyecto, sin contar el que se cambia, máximo el 100 %. */
async function assertBilling(
  tx: TenantTransaction,
  projectId: string,
  pct: number,
  exceptId: string | null,
): Promise<void> {
  await lockProject(tx, projectId);
  const others = await tx.prjMilestone.findMany({
    where: { projectId, deletedAt: null, ...(exceptId === null ? {} : { id: { not: exceptId } }) },
    select: { billingPct: true },
  });
  if (
    billingExceeds(
      others.map((row) => row.billingPct.toString()),
      pct,
    )
  )
    throw billingExceeded();
}

@Injectable()
export class PlanningUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async createMilestone(
    principal: Principal,
    projectId: string,
    input: MilestoneRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      await assertBilling(tx, projectId, input.billing_pct, null);
      const milestone = await tx.prjMilestone.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          name: input.name,
          dueOn: fromCalendarDate(input.due_on),
          billingPct: input.billing_pct,
        },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.milestone.create',
        event: 'project.milestone.created',
        entityType: 'prj_milestone',
        entityId: milestone.id,
        changes: { project: project.code, ...milestoneAudit(milestone) },
        payload: { project_id: projectId, code: project.code },
      });
      return milestone.id;
    });
  }

  async updateMilestone(
    principal: Principal,
    target: ProjectPartTarget,
    input: MilestoneRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const before = await findMilestone(tx, target);
      if (before.status === 'done') throw statusInvalid('Un hito cumplido ya no cambia.');
      await assertBilling(tx, target.projectId, input.billing_pct, target.id);
      const { count } = await tx.prjMilestone.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          name: input.name,
          dueOn: fromCalendarDate(input.due_on),
          billingPct: input.billing_pct,
        },
      });
      if (count === 0) throw versionConflict();
      const after = await findMilestone(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.milestone.update',
        event: 'project.milestone.updated',
        entityType: 'prj_milestone',
        entityId: target.id,
        changes: {
          project: project.code,
          ...changesBetween(milestoneAudit(before), milestoneAudit(after)),
        },
        payload: { project_id: target.projectId, code: project.code },
      });
    });
  }

  async completeMilestone(
    principal: Principal,
    target: ProjectPartTarget,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const milestone = await findMilestone(tx, target);
      if (milestone.status === 'done') throw statusInvalid('El hito ya está cumplido.');
      const { count } = await tx.prjMilestone.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { status: 'done', doneAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await recordProjectChange(tx, actor, {
        action: 'project.milestone.complete',
        event: 'project.milestone.completed',
        entityType: 'prj_milestone',
        entityId: target.id,
        changes: {
          project: project.code,
          ...milestoneAudit(milestone),
          status: ['pending', 'done'],
        },
        payload: { project_id: target.projectId, code: project.code },
      });
    });
  }

  async addLink(
    principal: Principal,
    projectId: string,
    input: LinkRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      const link = await tx.prjExternalLink.create({
        data: { tenantId: actor.tenantId, projectId, ...input },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.link.add',
        event: 'project.link.added',
        entityType: 'prj_external_link',
        entityId: link.id,
        changes: { project: project.code, ...input },
        payload: { project_id: projectId, code: project.code },
      });
      return link.id;
    });
  }

  async removeLink(
    principal: Principal,
    target: { readonly projectId: string; readonly id: string },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const link = await tx.prjExternalLink.findFirst({
        where: { id: target.id, projectId: target.projectId, deletedAt: null },
      });
      if (link === null) throw projectNotFound('El enlace');
      await tx.prjExternalLink.update({ where: { id: link.id }, data: { deletedAt: actor.at } });
      await recordProjectChange(tx, actor, {
        action: 'project.link.remove',
        event: 'project.link.removed',
        entityType: 'prj_external_link',
        entityId: link.id,
        changes: { project: project.code, kind: link.kind, url: link.url, label: link.label },
        payload: { project_id: target.projectId, code: project.code },
      });
    });
  }
}
