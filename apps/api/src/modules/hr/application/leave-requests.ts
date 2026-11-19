import { Inject, Injectable } from '@nestjs/common';
import {
  HR_ONLY_LEAVE_TYPES,
  LEAVE_TYPE,
  LEAVE_TYPES_CATALOG,
  type LeaveTypeOption,
  type RegisterLeave,
  type RequestLeave,
} from '@arza/contracts';
import { Decimal } from 'decimal.js';

import type { HrEmployee } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  activeCatalogOptions,
  bogotaToday,
  fromCalendarDate,
  isActiveCatalogCode,
  toCalendarDate,
  workCalendarBetween,
} from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { leaveDays } from '../domain/leave-days.js';
import {
  auditHr,
  hrInvalid,
  lockKey,
  managerOf,
  requireActiveEmployee,
  requireOwnEmployee,
  type HrActor,
} from './hr-support.js';
import { addLeaveNovelties, announceLeave } from './leave-effects.js';
import { vacationBalance } from './leave-views.js';

// Solicitudes de ausencia (B36, ficha 17.13): el colaborador radica desde «Mi espacio» y su jefe
// decide; Talento humano registra a nombre de otro las incapacidades, las licencias con soporte y
// las vacaciones anticipadas, que quedan aprobadas al registrarse (decisiones 3 y 4).

interface NewLeave {
  readonly employee: HrEmployee;
  readonly input: RequestLeave;
  readonly days: number;
  readonly requestKey: string;
}

/** Tipo activo del catálogo; el colaborador no radica los que registra Talento humano. */
async function assertLeaveType(tx: TenantTransaction, type: string, byHr: boolean) {
  if (!(await isActiveCatalogCode(tx, LEAVE_TYPES_CATALOG, type))) {
    throw hrInvalid('Seleccione un tipo de ausencia de la lista.');
  }
  if (!byHr && HR_ONLY_LEAVE_TYPES.includes(type)) {
    throw hrInvalid('Las incapacidades las registra Talento humano con su soporte.');
  }
}

/** Días que suma la ausencia; debe tener al menos uno que cuente. */
async function countDays(tx: TenantTransaction, input: RequestLeave): Promise<number> {
  const calendar = await workCalendarBetween(tx, input.starts_on, input.ends_on);
  const days = leaveDays(input.type, input.starts_on, input.ends_on, calendar);
  if (days === 0) throw hrInvalid('Las fechas no incluyen ningún día hábil.');
  return days;
}

/** Ninguna otra ausencia vigente del colaborador se cruza con estas fechas. */
async function assertNoOverlap(tx: TenantTransaction, employeeId: string, input: RequestLeave) {
  const overlapping = await tx.hrLeaveRequest.count({
    where: {
      employeeId,
      deletedAt: null,
      status: { in: ['requested', 'approved', 'taken'] },
      startsOn: { lte: fromCalendarDate(input.ends_on) },
      endsOn: { gte: fromCalendarDate(input.starts_on) },
    },
  });
  if (overlapping > 0) throw hrInvalid('Ya tiene una ausencia en esas fechas.');
}

/** Las vacaciones no superan el saldo disponible (decisión 4). */
async function assertBalance(tx: TenantTransaction, leave: NewLeave, today: string) {
  if (leave.input.type !== LEAVE_TYPE.vacation) return;
  const balance = await vacationBalance(tx, leave.employee, today);
  if (new Decimal(balance.available).greaterThanOrEqualTo(leave.days)) return;
  throw hrInvalid(
    `Solicita ${String(leave.days)} días y tiene ${balance.available} disponibles. Si se acordaron vacaciones anticipadas, las registra Talento humano.`,
  );
}

/** Repite la respuesta si la petición es la misma; si cambió, la clave no se puede reusar. */
async function replayed(
  tx: TenantTransaction,
  tenantId: string,
  requestKey: string,
  input: RequestLeave,
): Promise<string | null> {
  await lockKey(tx, `hr.leave:${tenantId}:${requestKey}`);
  const existing = await tx.hrLeaveRequest.findUnique({
    where: { tenantId_requestKey: { tenantId, requestKey } },
  });
  if (existing === null) return null;
  const same =
    existing.type === input.type &&
    toCalendarDate(existing.startsOn) === input.starts_on &&
    toCalendarDate(existing.endsOn) === input.ends_on;
  if (!same) throw idempotencyKeyReused();
  return existing.id;
}

@Injectable()
export class LeaveRequests {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async types(principal: Principal): Promise<LeaveTypeOption[]> {
    return this.database.withTenant(principal, async (tx) => {
      const options = await activeCatalogOptions(tx, LEAVE_TYPES_CATALOG);
      return options.map(({ code, label }) => ({
        code,
        label,
        hr_only: HR_ONLY_LEAVE_TYPES.includes(code),
      }));
    });
  }

  /** El colaborador radica su ausencia; su jefe inmediato recibe el aviso. */
  async request(
    principal: Principal,
    meta: RequestMeta,
    requestKey: string,
    input: RequestLeave,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    const today = bogotaToday(actor.at);
    if (input.starts_on < today) throw hrInvalid('La ausencia no puede empezar en el pasado.');
    return this.database.withTenant(principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, requestKey, input);
      if (previous !== null) return previous;
      const employee = await requireOwnEmployee(tx, actor.userId);
      await assertLeaveType(tx, input.type, false);
      await lockKey(tx, `hr.leave.employee:${employee.id}`);
      const leave = { employee, input, days: await countDays(tx, input), requestKey };
      await assertNoOverlap(tx, employee.id, input);
      await assertBalance(tx, leave, today);
      return storeRequested(tx, actor, leave);
    });
  }

  /** Talento humano registra a nombre del colaborador; queda aprobada y llega a nómina. */
  async register(
    principal: Principal,
    meta: RequestMeta,
    requestKey: string,
    input: RegisterLeave,
  ): Promise<string> {
    const actor: HrActor = { ...principal, at: this.clock.now(), meta };
    return this.database.withTenant(principal, async (tx) => {
      const previous = await replayed(tx, actor.tenantId, requestKey, input);
      if (previous !== null) return previous;
      const employee = await requireActiveEmployee(tx, input.employee_id);
      await assertLeaveType(tx, input.type, true);
      await assertSupport(tx, principal, input.support_file_id);
      await lockKey(tx, `hr.leave.employee:${employee.id}`);
      const leave = { employee, input, days: await countDays(tx, input), requestKey };
      await assertNoOverlap(tx, employee.id, input);
      return storeRegistered(tx, actor, leave, input.support_file_id);
    });
  }
}

async function assertSupport(tx: TenantTransaction, principal: Principal, fileId: string | null) {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw hrInvalid('El soporte adjunto no está disponible.');
}

function leaveData(actor: HrActor, leave: NewLeave) {
  return {
    tenantId: actor.tenantId,
    employeeId: leave.employee.id,
    type: leave.input.type,
    startsOn: fromCalendarDate(leave.input.starts_on),
    endsOn: fromCalendarDate(leave.input.ends_on),
    days: leave.days,
    note: leave.input.note,
    requestedBy: actor.userId,
    requestKey: leave.requestKey,
  };
}

async function storeRequested(tx: TenantTransaction, actor: HrActor, leave: NewLeave) {
  const approverId = await managerOf(tx, leave.employee);
  const row = await tx.hrLeaveRequest.create({ data: { ...leaveData(actor, leave), approverId } });
  await auditHr(tx, actor, {
    action: 'hr.leave.request',
    entityType: 'hr_leave_request',
    entityId: row.id,
    changes: { type: row.type, days: row.days, status: 'requested', approver_id: approverId },
  });
  await announceLeave(tx, actor, { leaveId: row.id, approverId, kind: 'requested' });
  return row.id;
}

async function storeRegistered(
  tx: TenantTransaction,
  actor: HrActor,
  leave: NewLeave,
  supportFileId: string | null,
) {
  const row = await tx.hrLeaveRequest.create({
    data: {
      ...leaveData(actor, leave),
      status: 'approved',
      decidedBy: actor.userId,
      decidedAt: actor.at,
      supportFileId,
    },
  });
  await auditHr(tx, actor, {
    action: 'hr.leave.register',
    entityType: 'hr_leave_request',
    entityId: row.id,
    changes: {
      type: row.type,
      days: row.days,
      status: 'approved',
      has_support: supportFileId !== null,
    },
  });
  await addLeaveNovelties(tx, actor.tenantId, row);
  return row.id;
}
