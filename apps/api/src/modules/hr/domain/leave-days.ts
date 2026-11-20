import { LEAVE_TYPE } from '@arza/contracts';
import { Decimal } from 'decimal.js';

import { addDays, isBusinessDay, type WorkCalendar } from '../../core/index.js';

// Días de una ausencia y saldo de vacaciones (B36, decisiones 3, 4 y 6). Las vacaciones se cuentan
// en días hábiles (de lunes a viernes sin festivos, con el horario de la empresa); las licencias e
// incapacidades, en días calendario. Una ausencia que cruza dos meses se reparte entre ambos.

/** Las vacaciones cuentan días hábiles; los demás tipos, días calendario. */
export function countsBusinessDays(type: string): boolean {
  return type === LEAVE_TYPE.vacation;
}

/** El mes AAAA-MM de una fecha. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** Tramo de una ausencia dentro de un mes. */
export interface MonthSlice {
  readonly period: string;
  readonly from: string;
  readonly to: string;
  readonly days: number;
}

/** Cada día de la ausencia que cuenta para su tipo. */
function countedDays(type: string, from: string, to: string, calendar: WorkCalendar): string[] {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (!countsBusinessDays(type) || isBusinessDay(date, calendar)) days.push(date);
  }
  return days;
}

/** Días que suma una ausencia entre `from` y `to`, ambos incluidos. */
export function leaveDays(type: string, from: string, to: string, calendar: WorkCalendar): number {
  return countedDays(type, from, to, calendar).length;
}

/** La ausencia repartida por meses, para las novedades de nómina. */
export function leaveByMonth(
  type: string,
  from: string,
  to: string,
  calendar: WorkCalendar,
): MonthSlice[] {
  const slices = new Map<string, { from: string; to: string; days: number }>();
  for (const date of countedDays(type, from, to, calendar)) {
    const period = periodOf(date);
    const slice = slices.get(period);
    if (slice === undefined) slices.set(period, { from: date, to: date, days: 1 });
    else slices.set(period, { ...slice, to: date, days: slice.days + 1 });
  }
  return [...slices.entries()].map(([period, slice]) => ({ period, ...slice }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365;

/**
 * Días de vacaciones ganados desde el ingreso hasta `today` (CST, art. 186): los días por año
 * trabajado, en proporción a los días corridos, con dos decimales hacia abajo.
 */
export function accruedVacationDays(hireDate: string, today: string, perYear: number): Decimal {
  const worked = Math.max(
    0,
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${hireDate}T00:00:00Z`)) / DAY_MS,
  );
  return new Decimal(perYear)
    .times(worked)
    .dividedBy(DAYS_PER_YEAR)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

/** Lo que queda por solicitar: lo ganado menos lo usado; nunca negativo al mostrarlo. */
export function availableVacationDays(accrued: Decimal, used: number): Decimal {
  return accrued.minus(used);
}
