import { describe, expect, it } from 'vitest';

import {
  accruedVacationDays,
  availableVacationDays,
  countsBusinessDays,
  leaveByMonth,
  leaveDays,
  periodOf,
} from './leave-days.js';
import { overtimeLimitProblem, weekOf } from './overtime-limits.js';
import { weightedScore } from './review-score.js';

// Lunes a viernes, con el 8 de diciembre de 2026 (martes) como festivo.
const CALENDAR = { workdays: new Set([1, 2, 3, 4, 5]), holidays: new Set(['2026-12-08']) };
const RULES = { overtime_daily_max: 2, overtime_weekly_max: 12 };

describe('días de una ausencia (decisiones 3 y 4)', () => {
  it('las vacaciones cuentan días hábiles: sin fines de semana ni festivos', () => {
    // Del lunes 7 al domingo 13 de diciembre: 5 días de lunes a viernes, menos el festivo.
    expect(leaveDays('VACACIONES', '2026-12-07', '2026-12-13', CALENDAR)).toBe(4);
    expect(countsBusinessDays('VACACIONES')).toBe(true);
  });

  it('las licencias e incapacidades cuentan días calendario', () => {
    expect(leaveDays('INCAPACIDAD', '2026-12-07', '2026-12-13', CALENDAR)).toBe(7);
    expect(countsBusinessDays('LUTO')).toBe(false);
  });

  it('una ausencia que cruza dos meses se reparte entre ambos', () => {
    expect(leaveByMonth('VACACIONES', '2026-11-26', '2026-12-04', CALENDAR)).toEqual([
      { period: '2026-11', from: '2026-11-26', to: '2026-11-30', days: 3 },
      { period: '2026-12', from: '2026-12-01', to: '2026-12-04', days: 4 },
    ]);
    expect(periodOf('2026-12-04')).toBe('2026-12');
  });

  it('una ausencia de puro fin de semana no suma días hábiles', () => {
    expect(leaveByMonth('VACACIONES', '2026-12-12', '2026-12-13', CALENDAR)).toEqual([]);
  });
});

describe('saldo de vacaciones (CST art. 186)', () => {
  it('gana 15 días hábiles por año, en proporción, con dos decimales hacia abajo', () => {
    expect(accruedVacationDays('2025-12-01', '2026-12-01', 15).toFixed(2)).toBe('15.00');
    expect(accruedVacationDays('2026-06-01', '2026-12-01', 15).toFixed(2)).toBe('7.52');
  });

  it('antes del ingreso no hay saldo y lo usado se descuenta', () => {
    expect(accruedVacationDays('2026-12-10', '2026-12-01', 15).toFixed(2)).toBe('0.00');
    const accrued = accruedVacationDays('2025-12-01', '2026-12-01', 15);
    expect(availableVacationDays(accrued, 6).toFixed(2)).toBe('9.00');
  });
});

describe('topes de horas extras (decisión 5)', () => {
  it('la semana va de lunes a domingo', () => {
    expect(weekOf('2026-12-10')).toEqual({ monday: '2026-12-07', sunday: '2026-12-13' });
    expect(weekOf('2026-12-13')).toEqual({ monday: '2026-12-07', sunday: '2026-12-13' });
  });

  it('no deja pasar de 2 horas por día ni de 12 por semana', () => {
    expect(overtimeLimitProblem(2, { day: 0, week: 0 }, RULES)).toBeNull();
    expect(overtimeLimitProblem(1, { day: 1.5, week: 2 }, RULES)).toContain('por día');
    expect(overtimeLimitProblem(2, { day: 0, week: 11 }, RULES)).toContain('por semana');
    expect(overtimeLimitProblem(1, { day: 0, week: 11 }, RULES)).toBeNull();
  });
});

describe('calificación de desempeño (decisión 7)', () => {
  it('es el promedio ponderado por el peso de cada objetivo', () => {
    const objectives = [{ weight: 60 }, { weight: 40 }];
    expect(weightedScore(objectives, [5, 3]).toFixed(2)).toBe('4.20');
    expect(weightedScore([{ weight: 100 }], [4]).toFixed(2)).toBe('4.00');
  });
});
