import { Inject, Injectable } from '@nestjs/common';
import {
  workPlanCompliance,
  type CompleteWorkPlanItem,
  type SaveWorkPlanItem,
  type WorkPlanItem,
  type WorkPlanResponse,
} from '@arza/contracts';

import type { SstWorkPlanItem } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { isActiveInternalUser } from '../../iam/index.js';
import {
  assertFile,
  auditSst,
  dateOf,
  emitSst,
  refOf,
  sstConflict,
  sstInvalid,
  sstNotFound,
  userRefs,
  type SstActor,
  type Target,
} from './sst-support.js';

// Plan anual de trabajo del SG-SST (B37, decisión 14; PL-SST-001): cada actividad con responsable
// y fecha; se da por hecha solo con su evidencia. El plan muestra el cumplimiento del año y el de
// la fecha.

function itemView(
  row: SstWorkPlanItem,
  responsible: { readonly id: string; readonly name: string },
  today: string,
): WorkPlanItem {
  const dueOn = toCalendarDate(row.dueOn);
  return {
    id: row.id,
    year: row.year,
    activity: row.activity,
    responsible,
    due_on: dueOn,
    done_on: dateOf(row.doneOn),
    evidence_file_id: row.evidenceFileId,
    overdue: row.doneOn === null && dueOn < today,
    version: row.version,
  };
}

@Injectable()
export class WorkPlan {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, year?: number): Promise<WorkPlanResponse> {
    const today = bogotaToday(this.clock.now());
    const planYear = year ?? Number(today.slice(0, 4));
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.sstWorkPlanItem.findMany({
        where: { year: planYear, deletedAt: null },
        orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.responsibleId),
      );
      const data = rows.map((row) => itemView(row, refOf(refs, row.responsibleId), today));
      return { year: planYear, compliance: workPlanCompliance(data, today), data };
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveWorkPlanItem): Promise<string> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (!input.due_on.startsWith(String(input.year))) {
      throw sstInvalid('La fecha de la actividad debe caer en el año del plan.');
    }
    return this.database.withTenant(principal, async (tx) => {
      if (!(await isActiveInternalUser(tx, input.responsible_id))) {
        throw sstInvalid('El responsable no es un colaborador activo.');
      }
      const row = await tx.sstWorkPlanItem.create({
        data: {
          tenantId: actor.tenantId,
          year: input.year,
          activity: input.activity,
          responsibleId: input.responsible_id,
          dueOn: fromCalendarDate(input.due_on),
        },
      });
      await auditSst(tx, actor, {
        action: 'sst.plan.create',
        entityType: 'sst_work_plan_item',
        entityId: row.id,
        changes: { year: input.year, activity: input.activity, due_on: input.due_on },
      });
      await emitSst(tx, actor, 'sst.task.assigned', {
        item_id: row.id,
        task: input.activity,
        due_on: input.due_on,
        recipients: [input.responsible_id],
        link: '/app/talento-y-sst/sst/plan',
      });
      return row.id;
    });
  }

  /** La actividad queda hecha con su evidencia (decisión 14). */
  async complete(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: CompleteWorkPlanItem,
  ): Promise<void> {
    const actor: SstActor = { ...principal, at: this.clock.now(), meta };
    if (input.done_on > bogotaToday(actor.at)) {
      throw sstInvalid('La fecha de realización no puede ser futura.');
    }
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.sstWorkPlanItem.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw sstNotFound('La actividad del plan no existe.');
      if (row.doneOn !== null) throw sstConflict('La actividad ya está hecha.');
      await assertFile(tx, principal, input.evidence_file_id);
      const updated = await tx.sstWorkPlanItem.updateMany({
        where: { id: row.id, version: target.version, doneOn: null },
        data: {
          doneOn: fromCalendarDate(input.done_on),
          doneBy: actor.userId,
          evidenceFileId: input.evidence_file_id,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditSst(tx, actor, {
        action: 'sst.plan.complete',
        entityType: 'sst_work_plan_item',
        entityId: row.id,
        changes: { done_on: input.done_on, evidence_file_id: input.evidence_file_id },
      });
    });
  }
}
