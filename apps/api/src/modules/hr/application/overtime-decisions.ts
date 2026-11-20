import { Inject, Injectable } from '@nestjs/common';
import type { Overtime, OvertimeStatus } from '@arza/contracts';

import type { HrOvertime } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { periodOf } from '../domain/leave-days.js';
import {
  auditHr,
  employeeOfUser,
  hrConflict,
  hrInvalid,
  hrNotFound,
  type HrActor,
  type HrViewer,
} from './hr-support.js';
import { assertWithinLimits, canDecideOvertime, overtimeViews } from './overtime-views.js';
import { addAutomaticNovelty, OVERTIME_CONCEPTS } from './payroll-sync.js';

// Autorización, reporte y consulta de las horas extras (B36, decisión 5). Se autorizan antes del
// día de trabajo; después, el colaborador (o Talento humano) reporta las horas trabajadas, nunca
// más de las autorizadas, y la novedad llega al mes de nómina.

interface OvertimeTarget {
  readonly id: string;
  readonly version: number;
}

type Decision =
  | { readonly authorize: true; readonly note: string | null }
  | {
      readonly authorize: false;
      readonly note: string;
    };

async function requireOvertime(tx: TenantTransaction, id: string): Promise<HrOvertime> {
  const row = await tx.hrOvertime.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw hrNotFound('La solicitud de horas extras no existe.');
  return row;
}

function assertStatus(row: HrOvertime, target: OvertimeTarget, status: OvertimeStatus): void {
  if (row.version !== target.version) throw versionConflict();
  if (row.status !== status) throw hrConflict('La solicitud cambió de estado; recargue la página.');
}

async function isOwn(tx: TenantTransaction, userId: string, row: HrOvertime): Promise<boolean> {
  return (await employeeOfUser(tx, userId))?.id === row.employeeId;
}

async function announceDecision(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOvertime,
  authorized: boolean,
): Promise<void> {
  const employee = await tx.hrEmployee.findFirst({
    where: { id: row.employeeId },
    select: { userId: true },
  });
  const userId = employee?.userId ?? null;
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: 'hr.overtime.decided',
    payload: {
      overtime_id: row.id,
      decision: authorized ? 'authorized' : 'rejected',
      recipients: userId === null ? [] : [userId],
    },
  });
}

async function storeDecision(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOvertime,
  decision: Decision,
): Promise<void> {
  const status: OvertimeStatus = decision.authorize ? 'authorized' : 'rejected';
  const updated = await tx.hrOvertime.updateMany({
    where: { id: row.id, version: row.version, status: 'requested' },
    data: { status, decidedBy: actor.userId, decidedAt: actor.at, decisionNote: decision.note },
  });
  if (updated.count !== 1) throw versionConflict();
  await auditHr(tx, actor, {
    action: decision.authorize ? 'hr.overtime.authorize' : 'hr.overtime.reject',
    entityType: 'hr_overtime',
    entityId: row.id,
    changes: { status: { from: 'requested', to: status }, hours: Number(row.hours) },
  });
  await announceDecision(tx, actor, row, decision.authorize);
}

async function storeReport(
  tx: TenantTransaction,
  actor: HrActor,
  row: HrOvertime,
  hours: number,
): Promise<void> {
  const updated = await tx.hrOvertime.updateMany({
    where: { id: row.id, version: row.version, status: 'authorized' },
    data: { status: 'reported', reportedHours: hours, reportedAt: actor.at },
  });
  if (updated.count !== 1) throw versionConflict();
  const workDate = toCalendarDate(row.workDate);
  const period = await addAutomaticNovelty(tx, {
    tenantId: actor.tenantId,
    period: periodOf(workDate),
    employeeId: row.employeeId,
    concept: OVERTIME_CONCEPTS[row.kind] ?? row.kind,
    quantity: hours.toFixed(2),
    unit: 'hours',
    startsOn: workDate,
    endsOn: workDate,
    source: 'overtime',
    sourceId: row.id,
    note: null,
  });
  await auditHr(tx, actor, {
    action: 'hr.overtime.report',
    entityType: 'hr_overtime',
    entityId: row.id,
    changes: { status: { from: 'authorized', to: 'reported' }, hours, period },
  });
}

@Injectable()
export class OvertimeDecisions {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decide(
    viewer: HrViewer,
    meta: RequestMeta,
    target: OvertimeTarget,
    decision: Decision,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await requireOvertime(tx, target.id);
      if (!canDecideOvertime(viewer, row, await isOwn(tx, actor.userId, row))) {
        throw permissionDenied();
      }
      assertStatus(row, target, 'requested');
      if (decision.authorize) await assertAuthorizable(tx, row, actor.at);
      await storeDecision(tx, actor, row, decision);
    });
  }

  /** Reporta las horas trabajadas: el colaborador o Talento humano, ya pasado el día. */
  async report(
    viewer: HrViewer,
    meta: RequestMeta,
    target: OvertimeTarget,
    hours: number,
  ): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await requireOvertime(tx, target.id);
      const own = await isOwn(tx, actor.userId, row);
      if (!own && !hasUnconditionalPermission(viewer.ability, 'hr.employee.manage')) {
        throw hrNotFound('La solicitud de horas extras no existe.');
      }
      assertStatus(row, target, 'authorized');
      if (toCalendarDate(row.workDate) > bogotaToday(actor.at)) {
        throw hrInvalid('Las horas se reportan desde el día en que se trabajan.');
      }
      if (hours > Number(row.hours))
        throw hrInvalid('No puede reportar más horas de las autorizadas.');
      await storeReport(tx, actor, row, hours);
    });
  }

  /** El colaborador retira su solicitud mientras está por autorizar. */
  async cancel(viewer: HrViewer, meta: RequestMeta, target: OvertimeTarget): Promise<void> {
    const actor: HrActor = { ...viewer.principal, at: this.clock.now(), meta };
    await this.database.withTenant(viewer.principal, async (tx) => {
      const row = await requireOvertime(tx, target.id);
      if (!(await isOwn(tx, actor.userId, row))) {
        throw hrNotFound('La solicitud de horas extras no existe.');
      }
      assertStatus(row, target, 'requested');
      const updated = await tx.hrOvertime.updateMany({
        where: { id: row.id, version: row.version, status: 'requested' },
        data: { status: 'cancelled' },
      });
      if (updated.count !== 1) throw versionConflict();
      await auditHr(tx, actor, {
        action: 'hr.overtime.cancel',
        entityType: 'hr_overtime',
        entityId: row.id,
        changes: { status: { from: 'requested', to: 'cancelled' } },
      });
    });
  }

  async list(
    viewer: HrViewer,
    scope: 'mine' | 'team' | 'all',
    status: OvertimeStatus | undefined,
  ): Promise<Overtime[]> {
    if (scope === 'all' && !hasUnconditionalPermission(viewer.ability, 'hr.overtime.authorize')) {
      throw permissionDenied();
    }
    return this.database.withTenant(viewer.principal, async (tx) => {
      const owner = await scopeFilter(tx, viewer.principal.userId, scope);
      if (owner === null) return [];
      const rows = await tx.hrOvertime.findMany({
        where: { deletedAt: null, ...owner, ...(status === undefined ? {} : { status }) },
        orderBy: [{ workDate: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      return overtimeViews(tx, viewer, rows);
    });
  }
}

/** Antes del día de trabajo y todavía dentro de los topes. */
async function assertAuthorizable(tx: TenantTransaction, row: HrOvertime, at: Date) {
  const workDate = toCalendarDate(row.workDate);
  if (workDate < bogotaToday(at)) {
    throw hrInvalid('La autorización es previa: ese día ya pasó. Pida que la registren de nuevo.');
  }
  await assertWithinLimits(tx, {
    employeeId: row.employeeId,
    workDate,
    hours: Number(row.hours),
    exceptId: row.id,
  });
}

/** Qué solicitudes ve cada alcance: las propias, las que decide como jefe o todas. */
async function scopeFilter(
  tx: TenantTransaction,
  userId: string,
  scope: 'mine' | 'team' | 'all',
): Promise<Record<string, string> | null> {
  if (scope === 'all') return {};
  if (scope === 'team') return { approverId: userId };
  const own = await employeeOfUser(tx, userId);
  return own === null ? null : { employeeId: own.id };
}
