import { describe, expect, it } from 'vitest';

import { isLaborRules, PARAMETER_VALUE_SCHEMAS } from '../core/calendar.js';
import {
  registerLeaveSchema,
  reportOvertimeSchema,
  requestLeaveSchema,
  requestOvertimeSchema,
} from './absences.js';
import { createReviewSchema, recordAttendanceSchema, scoreReviewSchema } from './development.js';
import { decideDisciplinarySchema, openDisciplinarySchema } from './discipline.js';
import { DEFAULT_LABOR_RULES, laborRulesSchema } from './labor-rules.js';
import { OFFBOARDING_ITEMS, startOffboardingSchema } from './offboarding.js';
import { registerNoveltySchema } from './payroll.js';
import { NOVELTY_FILE_COLUMNS, noveltiesCsv, noveltiesFileName } from './payroll-file.js';

const ID = '01900000-0000-7000-8000-000000000001';

describe('reglas laborales (decisiones 4, 5 y 8 del B36)', () => {
  it('trae 40 horas, 2 y 12 horas extras, 15 días de vacaciones y 3 días de citación', () => {
    expect(laborRulesSchema.parse(DEFAULT_LABOR_RULES)).toEqual({
      weekly_hours: 40,
      overtime_daily_max: 2,
      overtime_weekly_max: 12,
      vacation_days_per_year: 15,
      disciplinary_notice_days: 3,
    });
  });

  it('no deja un tope diario mayor que el semanal', () => {
    const rules = { ...DEFAULT_LABOR_RULES, overtime_daily_max: 13, overtime_weekly_max: 12 };
    expect(laborRulesSchema.safeParse(rules).success).toBe(false);
  });

  it('es un parámetro con vigencia que se reconoce por su forma', () => {
    const value = PARAMETER_VALUE_SCHEMAS['hr.labor_rules'].parse(DEFAULT_LABOR_RULES);
    expect(isLaborRules(value)).toBe(true);
  });
});

describe('ausencias y horas extras', () => {
  it('no acepta una ausencia que termina antes de empezar', () => {
    const input = { type: 'VACACIONES', starts_on: '2026-12-10', ends_on: '2026-12-09' };
    expect(requestLeaveSchema.safeParse(input).success).toBe(false);
    expect(requestLeaveSchema.parse({ ...input, ends_on: '2026-12-10' }).note).toBeNull();
  });

  it('el registro de Talento humano lleva colaborador y soporte opcional', () => {
    const parsed = registerLeaveSchema.parse({
      employee_id: ID,
      type: 'INCAPACIDAD',
      starts_on: '2026-12-01',
      ends_on: '2026-12-03',
    });
    expect(parsed.support_file_id).toBeNull();
  });

  it('las horas extras van en cuartos de hora y con motivo', () => {
    const base = { work_date: '2026-12-01', kind: 'night', reason: 'Despliegue nocturno' };
    expect(requestOvertimeSchema.safeParse({ ...base, hours: 1.5 }).success).toBe(true);
    expect(requestOvertimeSchema.safeParse({ ...base, hours: 1.1 }).success).toBe(false);
    expect(requestOvertimeSchema.safeParse({ ...base, hours: 0 }).success).toBe(false);
    expect(reportOvertimeSchema.safeParse({ hours: 13 }).success).toBe(false);
  });
});

describe('novedades de nómina', () => {
  it('exige un mes AAAA-MM y una cantidad mayor que cero', () => {
    const base = { employee_id: ID, concept: 'BONIFICACION', unit: 'units' };
    expect(
      registerNoveltySchema.safeParse({ ...base, period: '2026-13', quantity: '1' }).success,
    ).toBe(false);
    expect(
      registerNoveltySchema.safeParse({ ...base, period: '2026-12', quantity: '0' }).success,
    ).toBe(false);
    const parsed = registerNoveltySchema.parse({ ...base, period: '2026-12', quantity: '1.5' });
    expect(parsed.amount).toBeNull();
  });
});

describe('desempeño y formación', () => {
  it('los pesos de los objetivos suman 100 %', () => {
    const review = { employee_id: ID, period: '2026' };
    const half = { title: 'Entregar a tiempo', weight: 50 };
    expect(createReviewSchema.safeParse({ ...review, objectives: [half] }).success).toBe(false);
    expect(createReviewSchema.safeParse({ ...review, objectives: [half, half] }).success).toBe(
      true,
    );
  });

  it('califica de 1 a 5 con comentario', () => {
    expect(scoreReviewSchema.safeParse({ scores: [6], comment: 'Muy bien' }).success).toBe(false);
    expect(scoreReviewSchema.safeParse({ scores: [4, 5], comment: 'Muy bien' }).success).toBe(true);
  });

  it('solo se califica a quien asistió', () => {
    const entry = { employee_id: ID, attended: false, evaluation: 4 };
    expect(recordAttendanceSchema.safeParse({ attendance: [entry] }).success).toBe(false);
    expect(
      recordAttendanceSchema.safeParse({ attendance: [{ ...entry, evaluation: null }] }).success,
    ).toBe(true);
  });
});

describe('proceso disciplinario (debido proceso)', () => {
  it('los hechos deben describirse', () => {
    expect(openDisciplinarySchema.safeParse({ employee_id: ID, facts: 'Corto' }).success).toBe(
      false,
    );
  });

  it('solo la suspensión lleva días', () => {
    const reasoning = 'Se comprobó el incumplimiento reiterado del horario.';
    expect(decideDisciplinarySchema.safeParse({ decision: 'suspension', reasoning }).success).toBe(
      false,
    );
    expect(
      decideDisciplinarySchema.safeParse({ decision: 'warning', suspension_days: 2, reasoning })
        .success,
    ).toBe(false);
    expect(
      decideDisciplinarySchema.safeParse({ decision: 'suspension', suspension_days: 2, reasoning })
        .success,
    ).toBe(true);
  });
});

describe('retiro', () => {
  it('la lista de chequeo incluye la devolución de activos y el examen de egreso', () => {
    expect(OFFBOARDING_ITEMS.assets_return.responsible).toBe('assets');
    expect(OFFBOARDING_ITEMS.exit_exam.responsible).toBe('sst');
  });

  it('exige motivo y último día', () => {
    expect(
      startOffboardingSchema.safeParse({ employee_id: ID, reason: 'resignation' }).success,
    ).toBe(false);
  });
});

describe('archivo de novedades para nómina (decisión 6)', () => {
  it('sale en CSV con punto y coma, coma decimal, fechas dd/mm/aaaa y sin fórmulas', () => {
    const csv = noveltiesCsv([
      {
        period: '2026-12',
        idNumber: '1000000001',
        employee: 'Ana Prueba',
        concept: 'HE_NOCTURNA',
        conceptLabel: 'Hora extra nocturna',
        quantity: '1.50',
        unit: 'hours',
        amount: null,
        startsOn: '2026-12-03',
        endsOn: '2026-12-03',
        source: 'overtime',
        note: '=SUMA(A1)',
      },
    ]);
    const [header, line] = csv.replace('﻿', '').split('\r\n');
    expect(header).toBe(NOVELTY_FILE_COLUMNS.join(';'));
    expect(line).toBe(
      "2026-12;1000000001;Ana Prueba;HE_NOCTURNA;Hora extra nocturna;1,50;Horas;;03/12/2026;03/12/2026;Horas extras;'=SUMA(A1)",
    );
    expect(noveltiesFileName('2026-12')).toBe('novedades-nomina-2026-12.csv');
  });
});
