import { Inject, Injectable } from '@nestjs/common';
import {
  deliveryEnvironmentSchema,
  incidentKindSchema,
  incidentSeveritySchema,
  incidentStatusSchema,
  riskLevelOf,
  riskStatusSchema,
  type DownloadLinkResponse,
  type ProjectIncident,
  type ProjectIndicators,
  type ProjectRelease,
  type ProjectRisk,
} from '@arza/contracts';
import { Decimal } from 'decimal.js';

import type { PrjProject } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { attachedFiles, AttachedFileLinks } from '../../doc/index.js';
import { elapsedPct, percentOf, profitabilityOf } from '../domain/control-rules.js';
import { progressOf } from '../domain/project-rules.js';
import { billingBase } from './acceptance-records.js';
import { projectNotFound } from './project-messages.js';
import { findVisibleProject, seesMoney } from './project-records.js';
import { peopleNames, personRef } from './project-support.js';

// Consultas del control del proyecto (B27): riesgos, liberaciones con su informe de pruebas,
// incidentes y los indicadores de avance, desviación y rentabilidad (ficha 17.8). La rentabilidad
// solo la ve quien ve todos los proyectos, no el equipo (decisión 7).

interface Where {
  readonly projectId: string;
  readonly deletedAt: null;
}

async function hourTotals(tx: TenantTransaction, where: Where) {
  const groups = await tx.prjTimeEntry.groupBy({
    by: ['status', 'billable'],
    where,
    _sum: { hours: true },
  });
  const sum = (match: (row: (typeof groups)[number]) => boolean) =>
    groups.filter(match).reduce((total, row) => total.plus(row._sum.hours ?? 0), new Decimal(0));
  return {
    logged: sum(() => true),
    approved: sum((row) => row.status === 'approved'),
    billable: sum((row) => row.status === 'approved' && row.billable),
    pending: sum((row) => row.status === 'registered'),
  };
}

async function progressCounts(tx: TenantTransaction, where: Where) {
  const groups = await tx.prjItem.groupBy({
    by: ['status'],
    where: { ...where, type: { not: 'epic' } },
    _count: { _all: true },
  });
  const planned = groups.reduce((total, row) => total + row._count._all, 0);
  const done = groups.find((row) => row.status === 'done')?._count._all ?? 0;
  return progressOf(planned, done);
}

async function moneyOf(tx: TenantTransaction, project: PrjProject, approved: Decimal) {
  if (project.hourCost === null) return null;
  const base = await billingBase(tx, project);
  const result = profitabilityOf(base, approved, project.hourCost.toString());
  return {
    income: base.toFixed(2),
    cost: result.cost.toFixed(2),
    margin: result.margin.toFixed(2),
    margin_pct: result.marginPct,
  };
}

function hoursView(project: PrjProject, hours: Awaited<ReturnType<typeof hourTotals>>) {
  return {
    budget: project.budgetHours.toNumber(),
    logged: hours.logged.toNumber(),
    approved: hours.approved.toNumber(),
    billable: hours.billable.toNumber(),
    pending: hours.pending.toNumber(),
    used_pct: percentOf(hours.approved, project.budgetHours.toString()),
  };
}

@Injectable()
export class ControlQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async risks(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<ProjectRisk[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const rows = await tx.prjRisk.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await peopleNames(
        tx,
        rows.map((row) => row.ownerId),
      );
      return rows.map((risk) => ({
        id: risk.id,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        level: riskLevelOf(risk.probability, risk.impact),
        response: risk.response,
        owner: personRef(names, risk.ownerId),
        status: riskStatusSchema.parse(risk.status),
        version: risk.version,
      }));
    });
  }

  async releases(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<ProjectRelease[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const rows = await tx.prjRelease.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ releasedOn: 'desc' }, { createdAt: 'desc' }],
      });
      const [names, files] = await Promise.all([
        peopleNames(
          tx,
          rows.map((row) => row.releasedBy),
        ),
        attachedFiles(
          tx,
          rows.map((row) => row.testReportFileId),
        ),
      ]);
      return rows.map((release) => {
        const file = files.get(release.testReportFileId);
        return {
          id: release.id,
          version_label: release.versionLabel,
          environment: deliveryEnvironmentSchema.parse(release.environment),
          released_on: toCalendarDate(release.releasedOn),
          notes: release.notes,
          test_report: file === undefined ? null : { id: file.id, file_name: file.file_name },
          released_by: personRef(names, release.releasedBy),
        };
      });
    });
  }

  async releaseReportLink(
    principal: Principal,
    ability: AppAbility,
    target: { readonly projectId: string; readonly id: string },
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, target.projectId);
      const release = await tx.prjRelease.findFirst({
        where: { id: target.id, projectId: target.projectId, deletedAt: null },
      });
      if (release === null) throw projectNotFound('La liberación');
      return this.links.issue(tx, principal, release.testReportFileId, meta);
    });
  }

  async incidents(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<ProjectIncident[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const rows = await tx.prjIncident.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      });
      const names = await peopleNames(
        tx,
        rows.map((row) => row.reportedBy),
      );
      return rows.map((incident) => ({
        id: incident.id,
        code: incident.code,
        title: incident.title,
        kind: incidentKindSchema.parse(incident.kind),
        severity: incidentSeveritySchema.parse(incident.severity),
        description: incident.description,
        detected_at: incident.detectedAt.toISOString(),
        personal_data: incident.personalData,
        status: incidentStatusSchema.parse(incident.status),
        resolved_at: incident.resolvedAt?.toISOString() ?? null,
        root_cause: incident.rootCause,
        actions: incident.actions,
        reported_by: personRef(names, incident.reportedBy),
        version: incident.version,
      }));
    });
  }

  /** Avance, horas, desviación del cronograma, rentabilidad, entregables, riesgos e incidentes. */
  async indicators(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<ProjectIndicators> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, projectId);
      const where: Where = { projectId, deletedAt: null };
      const [progress, hours, deliverables, risks, incidentsOpen] = await Promise.all([
        progressCounts(tx, where),
        hourTotals(tx, where),
        tx.prjDeliverable.groupBy({ by: ['status'], where, _count: { _all: true } }),
        tx.prjRisk.findMany({ where: { ...where, status: { not: 'closed' } } }),
        tx.prjIncident.count({ where: { ...where, status: 'open' } }),
      ]);
      const countOf = (status: string) =>
        deliverables.find((row) => row.status === status)?._count._all ?? 0;
      const elapsed = elapsedPct(
        toCalendarDate(project.startsOn),
        toCalendarDate(project.endsOn),
        today,
      );
      return {
        progress,
        hours: hoursView(project, hours),
        schedule: { elapsed_pct: elapsed, deviation_pts: progress.percent - elapsed },
        money: seesMoney(ability) ? await moneyOf(tx, project, hours.approved) : null,
        deliverables: {
          total: deliverables.reduce((total, row) => total + row._count._all, 0),
          accepted: countOf('accepted'),
          waiting: countOf('delivered'),
        },
        risks_high: risks.filter((risk) => riskLevelOf(risk.probability, risk.impact) === 'high')
          .length,
        incidents_open: incidentsOpen,
      };
    });
  }
}
