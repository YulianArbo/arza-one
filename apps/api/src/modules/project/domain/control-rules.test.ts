import { describe, expect, it } from 'vitest';
import { riskLevelOf } from '@arza/contracts';

import {
  billableAmount,
  closingProblems,
  dayTotalExceeds,
  earliestWorkDate,
  elapsedPct,
  percentOf,
  profitabilityOf,
  reviewProblem,
  workDateProblem,
} from './control-rules.js';

describe('horas (ficha 17.8: máximo siete días de atraso)', () => {
  it('acepta hoy y hasta siete días atrás', () => {
    expect(workDateProblem('2026-11-05', '2026-11-05')).toBeNull();
    expect(workDateProblem('2026-10-29', '2026-11-05')).toBeNull();
    expect(earliestWorkDate('2026-11-05')).toBe('2026-10-29');
  });

  it('rechaza el octavo día de atraso y los días futuros', () => {
    expect(workDateProblem('2026-10-28', '2026-11-05')).toContain('siete días');
    expect(workDateProblem('2026-11-06', '2026-11-05')).toContain('aún no llegan');
  });

  it('una persona no pasa de 24 horas en un día', () => {
    expect(dayTotalExceeds(['8', '8'], 8)).toBe(false);
    expect(dayTotalExceeds(['8', '8'], 8.25)).toBe(true);
  });
});

describe('revisión de código (FT-TEC-002)', () => {
  it('no se aprueba con un punto que no cumple', () => {
    expect(reviewProblem(['yes', 'no', 'na'], 'approved')).not.toBeNull();
    expect(reviewProblem(['yes', 'no', 'na'], 'changes_requested')).toBeNull();
    expect(reviewProblem(['yes', 'na'], 'approved')).toBeNull();
  });
});

describe('riesgos (decisión 10)', () => {
  it('bajo hasta 6, medio hasta 14, alto desde 15', () => {
    expect(riskLevelOf(2, 3)).toBe('low');
    expect(riskLevelOf(2, 4)).toBe('medium');
    expect(riskLevelOf(3, 4)).toBe('medium');
    expect(riskLevelOf(3, 5)).toBe('high');
    expect(riskLevelOf(5, 5)).toBe('high');
  });
});

describe('indicadores', () => {
  it('el valor del hito es su porcentaje del contrato, al centavo', () => {
    expect(billableAmount('10000000.00', '33.33').toFixed(2)).toBe('3333000.00');
    expect(billableAmount('1000.01', 50).toFixed(2)).toBe('500.01');
  });

  it('porcentajes enteros, sin dividir por cero', () => {
    expect(percentOf(30, 120)).toBe(25);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('tiempo transcurrido entre el inicio y el fin', () => {
    expect(elapsedPct('2026-01-01', '2026-01-11', '2025-12-31')).toBe(0);
    expect(elapsedPct('2026-01-01', '2026-01-11', '2026-01-06')).toBe(50);
    expect(elapsedPct('2026-01-01', '2026-01-11', '2026-02-01')).toBe(100);
  });

  it('rentabilidad: ingreso menos horas aprobadas por su costo', () => {
    const result = profitabilityOf('1000000', '10', '25000');
    expect(result.cost.toFixed(2)).toBe('250000.00');
    expect(result.margin.toFixed(2)).toBe('750000.00');
    expect(result.marginPct).toBe(75);
    expect(profitabilityOf('0', '1', '1').marginPct).toBeNull();
    expect(profitabilityOf('100', '2', '100').marginPct).toBe(-100);
  });
});

describe('cierre', () => {
  it('dice qué falta para cerrar', () => {
    expect(closingProblems({ deliverablesOpen: 0, incidentsOpen: 0, hoursPending: 0 })).toEqual([]);
    const problems = closingProblems({ deliverablesOpen: 1, incidentsOpen: 2, hoursPending: 3 });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('entregable');
  });
});
