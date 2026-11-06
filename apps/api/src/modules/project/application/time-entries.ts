import { Inject, Injectable } from '@nestjs/common';
import type { ApproveTimeRequest, ReturnTimeRequest, TimeEntryRequest } from '@arza/contracts';

import type { PrjTimeEntry } from '../../../generated/prisma/client.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { dayTotalExceeds, workDateProblem } from '../domain/control-rules.js';
import type { ItemRequester } from './items.js';
import { projectNotFound, statusInvalid, timeInvalid } from './project-messages.js';
import {
  assertOpen,
  canOnProject,
  findVisibleProject,
  type ProjectAccess,
} from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Registro de horas (B27, ficha 17.8): cada miembro registra las suyas, facturables o no, con
// máximo siete días de atraso y sin pasar de 24 horas en un día. El Líder técnico las aprueba o las
// devuelve con lo que hay que corregir; nadie decide sobre las suyas. Una hora aprobada ya no cambia.

function timeAudit(entry: PrjTimeEntry): Record<string, string | boolean | null> {
  return {
    user_id: entry.userId,
    work_date: toCalendarDate(entry.workDate),
    hours: entry.hours.toFixed(2),
    billable: entry.billable,
    item_id: entry.itemId,
    status: entry.status,
  };
}

function timePayload(entry: PrjTimeEntry, code: string) {
  return { project_id: entry.projectId, code, user_id: entry.userId, status: entry.status };
}

/** Solo registra horas quien es del equipo y tiene el permiso en este proyecto. */
async function projectForLogging(
  tx: TenantTransaction,
  requester: ItemRequester,
  projectId: string,
): Promise<ProjectAccess> {
  const access = await findVisibleProject(tx, requester.ability, projectId);
  const member = access.memberIds.includes(requester.principal.userId);
  if (!member || !canOnProject(requester.ability, 'project.time.log', access.memberIds)) {
    throw permissionDenied();
  }
  assertOpen(access.project);
  return access;
}

async function assertItem(tx: TenantTransaction, projectId: string, itemId: string | null) {
  if (itemId === null) return;
  const count = await tx.prjItem.count({ where: { id: itemId, projectId, deletedAt: null } });
  if (count === 0) throw timeInvalid('El ítem no es de este proyecto.');
}

/** El día está en plazo y, con lo que ya registró la persona ese día, no pasa de 24 horas. */
async function assertDay(
  tx: TenantTransaction,
  entry: { readonly userId: string; readonly exceptId: string | null; readonly at: Date },
  input: TimeEntryRequest,
): Promise<void> {
  const problem = workDateProblem(input.work_date, bogotaToday(entry.at));
  if (problem !== null) throw timeInvalid(problem);
  // Bloquea los registros de la persona ese día: dos pestañas no suman más de 24 horas.
  await tx.$queryRaw`SELECT id FROM prj_time_entries WHERE user_id = ${entry.userId}::uuid
    AND work_date = ${input.work_date}::date AND deleted_at IS NULL FOR UPDATE`;
  const others = await tx.prjTimeEntry.findMany({
    where: {
      userId: entry.userId,
      workDate: fromCalendarDate(input.work_date),
      deletedAt: null,
      ...(entry.exceptId === null ? {} : { id: { not: entry.exceptId } }),
    },
    select: { hours: true },
  });
  if (
    dayTotalExceeds(
      others.map((row) => row.hours.toString()),
      input.hours,
    )
  ) {
    throw timeInvalid('Entre todos sus registros de ese día pasaría de 24 horas.');
  }
}

async function findEntry(tx: TenantTransaction, target: { id: string; projectId: string }) {
  const entry = await tx.prjTimeEntry.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (entry === null) throw projectNotFound('El registro de horas');
  return entry;
}

/** Solo la persona corrige o borra las suyas, mientras no estén aprobadas. */
function assertOwnPending(entry: PrjTimeEntry, userId: string): void {
  if (entry.userId !== userId) throw permissionDenied();
  if (entry.status === 'approved') {
    throw statusInvalid('Una hora aprobada ya no cambia. Pida al líder que la devuelva.');
  }
}

function entryData(input: TimeEntryRequest) {
  return {
    workDate: fromCalendarDate(input.work_date),
    hours: input.hours,
    billable: input.billable,
    note: input.note,
    itemId: input.item_id,
  };
}

async function approveEntry(
  tx: TenantTransaction,
  actor: ProjectActor,
  code: string,
  entry: PrjTimeEntry,
): Promise<void> {
  await tx.prjTimeEntry.update({
    where: { id: entry.id },
    data: { status: 'approved', decidedBy: actor.userId, decidedAt: actor.at },
  });
  await recordProjectChange(tx, actor, {
    action: 'project.time.approve',
    event: 'project.time.approved',
    entityType: 'prj_time_entry',
    entityId: entry.id,
    changes: { project: code, ...timeAudit(entry), status: ['registered', 'approved'] },
    payload: { ...timePayload(entry, code), status: 'approved' },
  });
}

@Injectable()
export class TimeEntriesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(requester: ItemRequester): ProjectActor {
    return projectActorOf(requester.principal, requester.meta, this.clock.now());
  }

  async log(requester: ItemRequester, projectId: string, input: TimeEntryRequest): Promise<string> {
    const actor = this.actor(requester);
    const userId = requester.principal.userId;
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await projectForLogging(tx, requester, projectId);
      await assertItem(tx, projectId, input.item_id);
      await assertDay(tx, { userId, exceptId: null, at: actor.at }, input);
      const entry = await tx.prjTimeEntry.create({
        data: { tenantId: actor.tenantId, projectId, userId, ...entryData(input) },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.time.log',
        event: 'project.time.logged',
        entityType: 'prj_time_entry',
        entityId: entry.id,
        changes: { project: project.code, ...timeAudit(entry) },
        payload: timePayload(entry, project.code),
      });
      return entry.id;
    });
  }

  /** Corrige una hora propia; una devuelta vuelve a quedar por aprobar. */
  async update(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: TimeEntryRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    const userId = requester.principal.userId;
    await this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await projectForLogging(tx, requester, target.projectId);
      const before = await findEntry(tx, target);
      assertOwnPending(before, userId);
      await assertItem(tx, target.projectId, input.item_id);
      await assertDay(tx, { userId, exceptId: before.id, at: actor.at }, input);
      const { count } = await tx.prjTimeEntry.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          ...entryData(input),
          status: 'registered',
          decidedBy: null,
          decidedAt: null,
          decisionNote: null,
        },
      });
      if (count === 0) throw versionConflict();
      const after = await findEntry(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.time.update',
        event: 'project.time.updated',
        entityType: 'prj_time_entry',
        entityId: before.id,
        changes: { project: project.code, ...changesBetween(timeAudit(before), timeAudit(after)) },
        payload: timePayload(after, project.code),
      });
    });
  }

  async remove(requester: ItemRequester, target: ProjectPartTarget): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await projectForLogging(tx, requester, target.projectId);
      const entry = await findEntry(tx, target);
      assertOwnPending(entry, requester.principal.userId);
      const { count } = await tx.prjTimeEntry.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await recordProjectChange(tx, actor, {
        action: 'project.time.remove',
        event: 'project.time.removed',
        entityType: 'prj_time_entry',
        entityId: entry.id,
        changes: { project: project.code, ...timeAudit(entry) },
        payload: timePayload(entry, project.code),
      });
    });
  }

  /** Aprueba varias horas por aprobar del proyecto; nunca las de quien aprueba. */
  async approve(
    requester: ItemRequester,
    projectId: string,
    input: ApproveTimeRequest,
  ): Promise<number> {
    const actor = this.actor(requester);
    const userId = requester.principal.userId;
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findVisibleProject(tx, requester.ability, projectId);
      assertOpen(project);
      const entries = await tx.prjTimeEntry.findMany({
        where: { id: { in: input.ids }, projectId, deletedAt: null },
      });
      if (entries.length !== new Set(input.ids).size) {
        throw projectNotFound('Uno de los registros de horas');
      }
      if (entries.some((entry) => entry.userId === userId)) {
        throw timeInvalid('Nadie aprueba sus propias horas: pídaselo a otro Líder técnico.');
      }
      if (entries.some((entry) => entry.status !== 'registered')) {
        throw statusInvalid('Solo se aprueban horas que están por aprobar.');
      }
      for (const entry of entries) await approveEntry(tx, actor, project.code, entry);
      return entries.length;
    });
  }

  async returnEntry(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: ReturnTimeRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    const userId = requester.principal.userId;
    await this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findVisibleProject(tx, requester.ability, target.projectId);
      assertOpen(project);
      const entry = await findEntry(tx, target);
      if (entry.userId === userId) {
        throw timeInvalid('Nadie devuelve sus propias horas: corríjalas usted mismo.');
      }
      if (entry.status === 'returned') throw statusInvalid('Esa hora ya está devuelta.');
      const { count } = await tx.prjTimeEntry.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          status: 'returned',
          decidedBy: userId,
          decidedAt: actor.at,
          decisionNote: input.reason,
        },
      });
      if (count === 0) throw versionConflict();
      await recordProjectChange(tx, actor, {
        action: 'project.time.return',
        event: 'project.time.returned',
        entityType: 'prj_time_entry',
        entityId: entry.id,
        changes: {
          project: project.code,
          ...timeAudit(entry),
          status: [entry.status, 'returned'],
          reason: input.reason,
        },
        payload: { ...timePayload(entry, project.code), status: 'returned' },
      });
    });
  }
}
