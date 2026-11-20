import { overtimeSchema, type Overtime } from '@arza/contracts';

import type { HrOvertime } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate, laborRulesOn, toCalendarDate } from '../../core/index.js';
import { overtimeLimitProblem, weekOf } from '../domain/overtime-limits.js';
import {
  decidesAsHrOrManager,
  employeeRefsById,
  hrInvalid,
  refOf,
  userRefs,
  type HrViewer,
} from './hr-support.js';

// Lo que se muestra de las horas extras y los topes legales que se revisan al pedirlas y al
// autorizarlas (B36, decisión 5).

/** Le corresponde autorizar: su jefe designado o quien autoriza sobre todos; nunca lo propio. */
export function canDecideOvertime(
  viewer: HrViewer,
  row: Pick<HrOvertime, 'approverId' | 'requestedBy'>,
  ownEmployee: boolean,
): boolean {
  if (ownEmployee || row.requestedBy === viewer.principal.userId) return false;
  return decidesAsHrOrManager(viewer, 'hr.overtime.authorize', row.approverId);
}

/** Horas que aún cuentan: lo reportado vale por lo trabajado; lo demás, por lo pedido. */
function countedHours(row: Pick<HrOvertime, 'hours' | 'reportedHours'>): number {
  return Number(row.reportedHours ?? row.hours);
}

/** Revisa que las horas quepan en los topes del día y de la semana del colaborador. */
export async function assertWithinLimits(
  tx: TenantTransaction,
  request: {
    readonly employeeId: string;
    readonly workDate: string;
    readonly hours: number;
    readonly exceptId: string | null;
  },
): Promise<void> {
  const week = weekOf(request.workDate);
  const rows = await tx.hrOvertime.findMany({
    where: {
      employeeId: request.employeeId,
      deletedAt: null,
      status: { in: ['requested', 'authorized', 'reported'] },
      workDate: { gte: fromCalendarDate(week.monday), lte: fromCalendarDate(week.sunday) },
      ...(request.exceptId === null ? {} : { NOT: { id: request.exceptId } }),
    },
  });
  const committed = {
    day: rows
      .filter((row) => toCalendarDate(row.workDate) === request.workDate)
      .reduce((sum, row) => sum + countedHours(row), 0),
    week: rows.reduce((sum, row) => sum + countedHours(row), 0),
  };
  const rules = await laborRulesOn(tx, request.workDate);
  const problem = overtimeLimitProblem(request.hours, committed, rules);
  if (problem !== null) throw hrInvalid(problem);
}

export async function overtimeViews(
  tx: TenantTransaction,
  viewer: HrViewer,
  rows: readonly HrOvertime[],
): Promise<Overtime[]> {
  const employees = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  const people = await userRefs(
    tx,
    rows.flatMap(({ approverId, decidedBy }) => [approverId, decidedBy]),
  );
  const own = await tx.hrEmployee.findMany({
    where: { userId: viewer.principal.userId, deletedAt: null },
    select: { id: true },
  });
  const ownIds = new Set(own.map(({ id }) => id));
  return rows.map((row) =>
    overtimeSchema.parse({
      id: row.id,
      employee: employees.get(row.employeeId) ?? { id: row.employeeId, name: 'Colaborador' },
      work_date: toCalendarDate(row.workDate),
      kind: row.kind,
      hours: Number(row.hours),
      reported_hours: row.reportedHours === null ? null : Number(row.reportedHours),
      reason: row.reason,
      status: row.status,
      approver: refOf(people, row.approverId),
      authorized_by:
        row.status === 'authorized' || row.status === 'reported'
          ? refOf(people, row.decidedBy)
          : null,
      decision_note: row.decisionNote,
      can_decide:
        row.status === 'requested' && canDecideOvertime(viewer, row, ownIds.has(row.employeeId)),
      version: row.version,
    }),
  );
}
