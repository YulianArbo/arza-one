import { Inject, Injectable } from '@nestjs/common';
import type {
  CloseIncident,
  CompleteInvestigationAction,
  InvestigationPlan,
  ReportToArl,
  SstIncidentDetail,
  SstIncidentSummary,
  StartInvestigation,
} from '@arza/contracts';

import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import {
  closeIncident,
  planInvestigation,
  reportToArl,
  startInvestigation,
  type IncidentContext,
} from './incident-steps.js';
import {
  incidentDetail,
  incidentNames,
  incidentSummary,
  type IncidentRow,
} from './incident-views.js';
import {
  auditSst,
  sstConflict,
  sstInvalid,
  sstNotFound,
  type SstActor,
  type SstViewer,
  type Target,
} from './sst-support.js';

// Incidentes y accidentes de trabajo con su investigación (B37, decisiones 5 y 6; FT-SST-003).

const WITH_INVESTIGATION = { investigation: { include: { actions: true } } } as const;

async function requireIncident(tx: TenantTransaction, id: string): Promise<IncidentRow> {
  const row = await tx.sstIncident.findFirst({
    where: { id, deletedAt: null },
    include: WITH_INVESTIGATION,
  });
  if (row === null) throw sstNotFound('El incidente no existe.');
  return row;
}

@Injectable()
export class Incidents {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Primero lo abierto; dentro de cada grupo, lo más reciente. */
  async list(principal: Principal): Promise<SstIncidentSummary[]> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstIncident.findMany({
        where: { deletedAt: null },
        include: WITH_INVESTIGATION,
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: 300,
      });
      const names = await incidentNames(tx, rows);
      const open = (status: string) => (status === 'closed' ? 1 : 0);
      return rows
        .map((row) => incidentSummary(row, names, now))
        .sort((a, b) => open(a.status) - open(b.status));
    });
  }

  async detail(principal: Principal, id: string): Promise<SstIncidentDetail> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const row = await requireIncident(tx, id);
      return incidentDetail(row, await incidentNames(tx, [row]), now);
    });
  }

  async reportArl(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ReportToArl,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => reportToArl(ctx, input));
  }

  async investigate(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: StartInvestigation,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => startInvestigation(ctx, input));
  }

  async plan(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: InvestigationPlan,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => planInvestigation(ctx, input));
  }

  async close(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: CloseIncident,
  ): Promise<void> {
    await this.step(principal, meta, target, (ctx) => closeIncident(ctx, input));
  }

  /** La acción la marca hecha su responsable o quien investiga. */
  async completeAction(
    viewer: SstViewer,
    meta: RequestMeta,
    target: Target,
    input: CompleteInvestigationAction,
  ): Promise<void> {
    const actor: SstActor = { ...viewer.principal, at: this.clock.now(), meta };
    if (input.done_on > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de realización no puede ser futura.');
    }
    const investigator = hasUnconditionalPermission(viewer.ability, 'sst.incident.investigate');
    await this.database.withTenant(viewer.principal, async (tx) => {
      const action = await tx.sstInvestigationAction.findFirst({
        where: {
          id: target.id,
          deletedAt: null,
          ...(investigator ? {} : { responsibleId: actor.userId }),
        },
      });
      if (action === null) throw sstNotFound('La acción no existe.');
      if (action.doneOn !== null) throw sstConflict('La acción ya está hecha.');
      const updated = await tx.sstInvestigationAction.updateMany({
        where: { id: action.id, version: target.version, doneOn: null },
        data: { doneOn: fromCalendarDate(input.done_on), doneBy: actor.userId, note: input.note },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.incident.action_done',
        entityType: 'sst_investigation_action',
        entityId: action.id,
        changes: { done_on: input.done_on, by: investigator ? 'sst' : 'responsible' },
      });
    });
  }

  private async step(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    run: (ctx: IncidentContext) => Promise<void>,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    await this.database.withTenant(principal, async (tx) => {
      const row = await requireIncident(tx, target.id);
      if (row.version !== target.version) throw versionConflict();
      await run({ tx, principal, actor, row, version: target.version });
    });
  }
}
