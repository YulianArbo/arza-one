import {
  LEAVE_TYPE,
  LEAVE_TYPES_CATALOG,
  leaveRequestSchema,
  type LeaveRequest,
  type LeaveStatus,
  type VacationBalance,
} from '@arza/contracts';

import type { HrEmployee, HrLeaveRequest } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission } from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { catalogLabels, laborRulesOn, toCalendarDate } from '../../core/index.js';
import { accruedVacationDays, availableVacationDays } from '../domain/leave-days.js';
import {
  decidesAsHrOrManager,
  employeeRefsById,
  refOf,
  userRefs,
  type HrViewer,
} from './hr-support.js';

// Lo que se muestra de las ausencias y el saldo de vacaciones (B36, decisiones 2 y 4). El soporte
// de una incapacidad o licencia solo lo ve Talento humano.

/** Estados que comprometen días de vacaciones: radicada, aprobada y disfrutada. */
const USING_DAYS: readonly LeaveStatus[] = ['requested', 'approved', 'taken'];

/** Días de vacaciones ya usados o comprometidos por el colaborador. */
async function usedVacationDays(tx: TenantTransaction, employeeId: string): Promise<number> {
  const result = await tx.hrLeaveRequest.aggregate({
    where: {
      employeeId,
      type: LEAVE_TYPE.vacation,
      status: { in: [...USING_DAYS] },
      deletedAt: null,
    },
    _sum: { days: true },
  });
  return result._sum.days ?? 0;
}

/** Saldo de vacaciones del colaborador a hoy. */
export async function vacationBalance(
  tx: TenantTransaction,
  employee: Pick<HrEmployee, 'id' | 'hireDate'>,
  today: string,
): Promise<VacationBalance> {
  const rules = await laborRulesOn(tx, today);
  const accrued = accruedVacationDays(
    toCalendarDate(employee.hireDate),
    today,
    rules.vacation_days_per_year,
  );
  const used = await usedVacationDays(tx, employee.id);
  return {
    accrued: accrued.toFixed(2),
    used,
    available: availableVacationDays(accrued, used).toFixed(2),
    days_per_year: rules.vacation_days_per_year,
  };
}

/** Las ausencias como las ve quien consulta. */
export async function leaveViews(
  tx: TenantTransaction,
  viewer: HrViewer,
  rows: readonly HrLeaveRequest[],
): Promise<LeaveRequest[]> {
  const employees = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  const people = await userRefs(
    tx,
    rows.flatMap(({ approverId, decidedBy }) => [approverId, decidedBy]),
  );
  const labels = await catalogLabels(tx, LEAVE_TYPES_CATALOG);
  const seesSupport = hasUnconditionalPermission(viewer.ability, 'hr.leave.approve');
  return rows.map((row) =>
    leaveRequestSchema.parse({
      id: row.id,
      employee: employees.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
      type: row.type,
      type_label: labels.get(row.type) ?? row.type,
      starts_on: toCalendarDate(row.startsOn),
      ends_on: toCalendarDate(row.endsOn),
      days: row.days,
      status: row.status,
      note: row.note,
      approver: refOf(people, row.approverId),
      decided_by: refOf(people, row.decidedBy),
      decided_on: row.decidedAt === null ? null : toCalendarDate(row.decidedAt),
      decision_note: row.decisionNote,
      support_file_id: seesSupport ? row.supportFileId : null,
      can_decide: row.status === 'requested' && canDecideLeave(viewer, row),
      version: row.version,
    }),
  );
}

/** Le corresponde decidir: su jefe designado o quien aprueba sobre todos, nunca la misma persona. */
export function canDecideLeave(
  viewer: HrViewer,
  row: Pick<HrLeaveRequest, 'approverId' | 'requestedBy'>,
): boolean {
  if (row.requestedBy === viewer.principal.userId) return false;
  return decidesAsHrOrManager(viewer, 'hr.leave.approve', row.approverId);
}
