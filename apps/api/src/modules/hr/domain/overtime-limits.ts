import type { LaborRules } from '@arza/contracts';

import { addDays, isoWeekday } from '../../core/index.js';

// Topes legales de horas extras (B36, ficha 17.13, decisión 5): por día y por semana (de lunes a
// domingo), según el parámetro «Reglas laborales». Se cuenta lo pedido, autorizado o reportado que
// aún sigue vigente; lo rechazado o retirado no suma.

/** Lunes y domingo de la semana de una fecha. */
export function weekOf(date: string): { readonly monday: string; readonly sunday: string } {
  const monday = addDays(date, 1 - isoWeekday(date));
  return { monday, sunday: addDays(monday, 6) };
}

/** Horas ya comprometidas el mismo día y en la misma semana, sin la solicitud nueva. */
export interface CommittedHours {
  readonly day: number;
  readonly week: number;
}

/** Problema con los topes, o null si la solicitud cabe. */
export function overtimeLimitProblem(
  hours: number,
  committed: CommittedHours,
  rules: Pick<LaborRules, 'overtime_daily_max' | 'overtime_weekly_max'>,
): string | null {
  if (committed.day + hours > rules.overtime_daily_max) {
    return `Supera el tope de ${String(rules.overtime_daily_max)} horas extras por día.`;
  }
  if (committed.week + hours > rules.overtime_weekly_max) {
    return `Supera el tope de ${String(rules.overtime_weekly_max)} horas extras por semana.`;
  }
  return null;
}
