import { Inject, Injectable } from '@nestjs/common';
import { riskLevelOf, type ReleaseRequest, type RiskRequest } from '@arza/contracts';

import type { PrjRelease, PrjRisk } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { attachedFiles, isAttachableFile } from '../../doc/index.js';
import { datesInvalid, fileInvalid, memberInvalid, projectNotFound } from './project-messages.js';
import { assertOpen, findProject } from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Riesgos y liberaciones del proyecto (B27, ficha 17.8). Un riesgo tiene probabilidad e impacto de
// 1 a 5 y su nivel se calcula; uno alto avisa al líder, que decide si el proyecto queda en riesgo
// (decisión 10). Cada liberación lleva su informe de pruebas en PDF (PR-TEC-003) y no se edita.

function riskAudit(risk: PrjRisk): Record<string, string | number | null> {
  return {
    probability: risk.probability,
    impact: risk.impact,
    level: riskLevelOf(risk.probability, risk.impact),
    owner_id: risk.ownerId,
    status: risk.status,
  };
}

async function assertOwner(tx: TenantTransaction, projectId: string, ownerId: string) {
  const count = await tx.prjMember.count({
    where: { projectId, userId: ownerId, deletedAt: null },
  });
  if (count === 0)
    throw memberInvalid('El responsable del riesgo debe ser del equipo del proyecto.');
}

function riskData(input: RiskRequest, at: Date) {
  return {
    description: input.description,
    probability: input.probability,
    impact: input.impact,
    response: input.response,
    ownerId: input.owner_id,
    status: input.status,
    closedAt: input.status === 'closed' ? at : null,
  };
}

/** Un riesgo que queda alto y abierto avisa al líder (evento project.risk.high). */
function highEvent(risk: PrjRisk, before: PrjRisk | null): boolean {
  const high = riskLevelOf(risk.probability, risk.impact) === 'high' && risk.status !== 'closed';
  const wasHigh =
    before !== null &&
    riskLevelOf(before.probability, before.impact) === 'high' &&
    before.status !== 'closed';
  return high && !wasHigh;
}

/** El informe de pruebas es un PDF que la persona subió y que pasó el antivirus. */
async function assertTestReport(tx: TenantTransaction, principal: Principal, fileId: string) {
  if (!(await isAttachableFile(tx, principal, fileId))) throw fileInvalid();
  const file = (await attachedFiles(tx, [fileId])).get(fileId);
  if (file?.mime_type !== 'application/pdf') throw fileInvalid();
}

function releaseAudit(release: PrjRelease): Record<string, string> {
  return {
    version_label: release.versionLabel,
    environment: release.environment,
    released_on: toCalendarDate(release.releasedOn),
    test_report_file_id: release.testReportFileId,
  };
}

@Injectable()
export class RisksReleasesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async createRisk(
    principal: Principal,
    projectId: string,
    input: RiskRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      assertOpen(project);
      await assertOwner(tx, projectId, input.owner_id);
      const risk = await tx.prjRisk.create({
        data: { tenantId: actor.tenantId, projectId, ...riskData(input, actor.at) },
      });
      await this.recordRisk(tx, actor, { code: project.code, managerId: project.managerId }, risk, {
        action: 'project.risk.create',
        before: null,
      });
      return risk.id;
    });
  }

  async updateRisk(
    principal: Principal,
    target: ProjectPartTarget,
    input: RiskRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      assertOpen(project);
      const before = await tx.prjRisk.findFirst({
        where: { id: target.id, projectId: target.projectId, deletedAt: null },
      });
      if (before === null) throw projectNotFound('El riesgo');
      await assertOwner(tx, target.projectId, input.owner_id);
      const { count } = await tx.prjRisk.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: riskData(input, before.closedAt ?? actor.at),
      });
      if (count === 0) throw versionConflict();
      const after = await tx.prjRisk.findFirstOrThrow({ where: { id: target.id } });
      await this.recordRisk(
        tx,
        actor,
        { code: project.code, managerId: project.managerId },
        after,
        {
          action: 'project.risk.update',
          before,
        },
      );
    });
  }

  private async recordRisk(
    tx: TenantTransaction,
    actor: ProjectActor,
    project: { readonly code: string; readonly managerId: string },
    risk: PrjRisk,
    step: { readonly action: string; readonly before: PrjRisk | null },
  ): Promise<void> {
    const high = highEvent(risk, step.before);
    const changes =
      step.before === null
        ? riskAudit(risk)
        : changesBetween(riskAudit(step.before), riskAudit(risk));
    await recordProjectChange(tx, actor, {
      action: step.action,
      event: high
        ? 'project.risk.high'
        : `project.risk.${step.before === null ? 'created' : 'updated'}`,
      entityType: 'prj_risk',
      entityId: risk.id,
      changes: { project: project.code, ...changes },
      payload: { project_id: risk.projectId, code: project.code, manager_id: project.managerId },
    });
  }

  async createRelease(
    principal: Principal,
    projectId: string,
    input: ReleaseRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      assertOpen(project);
      if (input.released_on > bogotaToday(actor.at)) {
        throw datesInvalid('Registre la liberación el día que se hizo, no antes.');
      }
      await assertTestReport(tx, principal, input.test_report_file_id);
      const release = await tx.prjRelease.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          versionLabel: input.version_label,
          environment: input.environment,
          releasedOn: fromCalendarDate(input.released_on),
          notes: input.notes,
          testReportFileId: input.test_report_file_id,
          releasedBy: principal.userId,
        },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.release.create',
        event: 'project.release.published',
        entityType: 'prj_release',
        entityId: release.id,
        changes: { project: project.code, ...releaseAudit(release) },
        payload: { project_id: projectId, code: project.code, environment: release.environment },
      });
      return release.id;
    });
  }
}
