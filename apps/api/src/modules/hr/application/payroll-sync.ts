import {
  AUTOMATIC_CONCEPTS,
  LEAVE_TYPE,
  type NoveltySource,
  type NoveltyUnit,
} from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../../core/index.js';
import { lockKey } from './hr-support.js';

// Novedades que la plataforma genera sola (B36, decisión 6): una ausencia aprobada, unas horas
// extras reportadas y un retiro llegan al mes en que ocurren. Si ese mes ya se cerró, la novedad va
// al siguiente mes abierto: lo cerrado no cambia (la base de datos también lo impide).

/** El mes siguiente, AAAA-MM. */
export function nextPeriod(period: string): string {
  const [year = 0, month = 0] = period.split('-').map(Number);
  return month === 12
    ? `${String(year + 1)}-01`
    : `${String(year)}-${String(month + 1).padStart(2, '0')}`;
}

/** Meses cerrados de la empresa. */
async function closedPeriods(tx: TenantTransaction): Promise<Set<string>> {
  const rows = await tx.hrPayrollPeriod.findMany({
    where: { status: 'closed', deletedAt: null },
    select: { period: true },
  });
  return new Set(rows.map(({ period }) => period));
}

/** El mes donde cae una novedad: el suyo si sigue abierto, o el siguiente abierto. */
export async function openPeriodFrom(tx: TenantTransaction, desired: string): Promise<string> {
  const closed = await closedPeriods(tx);
  let period = desired;
  while (closed.has(period)) period = nextPeriod(period);
  return period;
}

/** Concepto de nómina de una ausencia según su tipo. */
export function leaveConcept(type: string): string {
  if (type === LEAVE_TYPE.vacation) return AUTOMATIC_CONCEPTS.vacation;
  if (type === LEAVE_TYPE.sickLeave) return AUTOMATIC_CONCEPTS.sickLeave;
  if (type === LEAVE_TYPE.unpaid) return AUTOMATIC_CONCEPTS.unpaidLeave;
  return AUTOMATIC_CONCEPTS.paidLeave;
}

/** Concepto de nómina de cada clase de hora extra. */
export const OVERTIME_CONCEPTS: Readonly<Record<string, string>> = {
  day: AUTOMATIC_CONCEPTS.overtimeDay,
  night: AUTOMATIC_CONCEPTS.overtimeNight,
  holiday_day: AUTOMATIC_CONCEPTS.overtimeHolidayDay,
  holiday_night: AUTOMATIC_CONCEPTS.overtimeHolidayNight,
};

/** Lo que la plataforma anota en el mes. */
export interface AutomaticNovelty {
  readonly tenantId: string;
  readonly period: string;
  readonly employeeId: string;
  readonly concept: string;
  readonly quantity: string;
  readonly unit: NoveltyUnit;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly source: Exclude<NoveltySource, 'manual'>;
  readonly sourceId: string;
  readonly note: string | null;
}

/** Anota la novedad en su mes, o en el siguiente abierto si el suyo ya se cerró. */
export async function addAutomaticNovelty(
  tx: TenantTransaction,
  novelty: AutomaticNovelty,
): Promise<string> {
  // El mismo bloqueo del cierre: la novedad no se cuela en un mes que se está cerrando.
  let period = await openPeriodFrom(tx, novelty.period);
  await lockKey(tx, `hr.payroll.period:${novelty.tenantId}:${period}`);
  period = await openPeriodFrom(tx, period);
  await tx.hrPayrollNovelty.create({
    data: {
      tenantId: novelty.tenantId,
      period,
      employeeId: novelty.employeeId,
      concept: novelty.concept,
      quantity: novelty.quantity,
      unit: novelty.unit,
      startsOn: novelty.startsOn === null ? null : fromCalendarDate(novelty.startsOn),
      endsOn: novelty.endsOn === null ? null : fromCalendarDate(novelty.endsOn),
      sourceEntity: novelty.source,
      sourceId: novelty.sourceId,
      note: novelty.note,
    },
  });
  return period;
}
