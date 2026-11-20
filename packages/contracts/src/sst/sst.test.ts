import { describe, expect, it } from 'vitest';

import type { PermissionCode } from '../iam/permissions.js';
import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { SYSTEM_ROLES } from '../iam/roles.js';
import { addCommitteeMemberSchema, handleComplaintSchema } from './committees.js';
import { probabilityLabel, saveHazardSchema, valueRisk } from './hazards.js';
import { quickReportSchema } from './incidents.js';
import { recordMedicalExamSchema } from './medical.js';
import {
  assessStandardSchema,
  ratingOf,
  scoreStandards,
  type StandardResult,
} from './standards.js';
import { MINIMUM_STANDARDS } from './standards-table.js';
import { workPlanCompliance } from './work-plan.js';

const ID = '01900000-0000-7000-8000-000000000001';

describe('matriz de peligros GTC 45 (decisión 3)', () => {
  it('calcula probabilidad, riesgo y nivel en los bordes de cada rango', () => {
    expect(valueRisk(10, 4, 100)).toEqual({ probability: 40, risk: 4000, level: 'I' });
    expect(valueRisk(6, 1, 100)).toEqual({ probability: 6, risk: 600, level: 'I' });
    expect(valueRisk(2, 4, 60)).toEqual({ probability: 8, risk: 480, level: 'II' });
    expect(valueRisk(6, 1, 25)).toEqual({ probability: 6, risk: 150, level: 'II' });
    expect(valueRisk(6, 2, 10)).toEqual({ probability: 12, risk: 120, level: 'III' });
    expect(valueRisk(2, 2, 10)).toEqual({ probability: 4, risk: 40, level: 'III' });
    expect(valueRisk(2, 1, 10)).toEqual({ probability: 2, risk: 20, level: 'IV' });
    expect(valueRisk(0, 4, 100).level).toBe('IV');
  });

  it('interpreta la probabilidad', () => {
    expect([40, 24, 20, 10, 8, 6, 4, 0].map(probabilityLabel)).toEqual([
      'Muy alto',
      'Muy alto',
      'Alto',
      'Alto',
      'Medio',
      'Medio',
      'Bajo',
      'Bajo',
    ]);
  });

  it('solo admite los valores de la guía', () => {
    const base = {
      process_id: ID,
      activity: 'Trabajo en computador',
      hazard_class: 'biomechanical',
      hazard: 'Postura prolongada sentado',
      effects: 'Dolor lumbar',
      deficiency: 6,
      exposure: 4,
      consequence: 10,
      review_on: '2027-01-31',
    };
    expect(saveHazardSchema.safeParse(base).success).toBe(true);
    expect(saveHazardSchema.safeParse({ ...base, deficiency: 5 }).success).toBe(false);
    expect(saveHazardSchema.safeParse({ ...base, consequence: 50 }).success).toBe(false);
  });
});

describe('plan anual (decisión 14)', () => {
  it('da el cumplimiento del año y el de la fecha', () => {
    const items = [
      { due_on: '2026-03-01', done_on: '2026-02-20' },
      { due_on: '2026-06-01', done_on: null },
      { due_on: '2026-12-01', done_on: '2026-11-01' },
      { due_on: '2026-12-15', done_on: null },
    ];
    expect(workPlanCompliance(items, '2026-07-01')).toEqual({
      total: 4,
      done: 2,
      due_to_date: 2,
      done_of_due: 1,
      year_percent: 50,
      to_date_percent: 50,
    });
  });

  it('sin actividades no hay cumplimiento del año y sin vencidas se va al día', () => {
    expect(workPlanCompliance([], '2026-07-01')).toMatchObject({
      year_percent: 0,
      to_date_percent: 100,
    });
  });
});

describe('estándares mínimos (decisión 4)', () => {
  it('son 60 y suman 100 puntos', () => {
    expect(MINIMUM_STANDARDS).toHaveLength(60);
    expect(MINIMUM_STANDARDS.reduce((sum, standard) => sum + standard.weight, 0)).toBe(10000);
    expect(new Set(MINIMUM_STANDARDS.map((standard) => standard.code)).size).toBe(60);
  });

  it('cuenta lo que cumple o no aplica y clasifica el puntaje', () => {
    const all = new Map<string, StandardResult>(
      MINIMUM_STANDARDS.map((standard) => [standard.code, 'meets']),
    );
    expect(scoreStandards(2026, all)).toMatchObject({ score: 10000, rating: 'acceptable' });
    all.set('5.1.1', 'not_met');
    all.set('5.1.2', 'not_applicable');
    expect(scoreStandards(2026, all)).toMatchObject({ score: 9500, assessed: 60 });
    expect(scoreStandards(2026, new Map())).toMatchObject({ score: 0, assessed: 0 });
    expect([5999, 6000, 8500, 8501].map(ratingOf)).toEqual([
      'critical',
      'moderate',
      'moderate',
      'acceptable',
    ]);
  });

  it('pide justificación si no aplica y acción si no cumple', () => {
    expect(assessStandardSchema.safeParse({ result: 'not_applicable' }).success).toBe(false);
    expect(assessStandardSchema.safeParse({ result: 'not_met' }).success).toBe(false);
    expect(assessStandardSchema.safeParse({ result: 'meets' }).success).toBe(true);
  });
});

describe('reglas de los formularios', () => {
  it('un accidente dice quién se lesionó', () => {
    const report = { kind: 'accident', description: 'Se cayó en la escalera', location: 'Piso 2' };
    expect(quickReportSchema.safeParse(report).success).toBe(false);
    expect(quickReportSchema.safeParse({ ...report, affected: 'self' }).success).toBe(true);
  });

  it('el concepto con restricciones las exige y la próxima fecha va después', () => {
    const exam = {
      employee_id: ID,
      kind: 'periodic',
      exam_date: '2026-11-01',
      provider: 'IPS de prueba',
      concept: 'fit_with_restrictions',
    };
    expect(recordMedicalExamSchema.safeParse(exam).success).toBe(false);
    const ok = { ...exam, restrictions: 'Pausas activas cada hora', next_due_on: '2027-11-01' };
    expect(recordMedicalExamSchema.safeParse(ok).success).toBe(true);
    const back = { ...ok, next_due_on: '2026-10-01' };
    expect(recordMedicalExamSchema.safeParse(back).success).toBe(false);
  });

  it('el periodo en el comité y el cierre de una queja tienen sentido', () => {
    const member = {
      committee: 'coexistence',
      user_id: ID,
      represents: 'workers',
      from_on: '2026-01-01',
      until_on: '2025-12-31',
    };
    expect(addCommitteeMemberSchema.safeParse(member).success).toBe(false);
    expect(handleComplaintSchema.safeParse({ status: 'closed' }).success).toBe(true);
  });
});

describe('permisos de SST por rol (decisión 2)', () => {
  const codesOf = (role: SystemRoleCode) => systemRoleGrants(role).map((grant) => grant.code);
  const holders = (code: PermissionCode) =>
    SYSTEM_ROLES.map((role) => role.code).filter((role) => codesOf(role).includes(code));

  it('leen el módulo la Dirección, Calidad, Talento humano, SST y el Auditor', () => {
    expect(holders('sst.read')).toEqual([
      'DIRECCION',
      'CALIDAD',
      'TALENTO_HUMANO',
      'SST',
      'AUDITOR',
    ]);
  });

  it('solo SST registra elementos de protección y gestiona el módulo', () => {
    expect(holders('sst.ppe.manage')).toEqual(['SST']);
    expect(holders('sst.incident.close')).toEqual(['SST']);
    expect(holders('sst.medical.manage')).toEqual(['SST']);
  });

  it('todo colaborador reporta, limitado a lo propio', () => {
    const grant = systemRoleGrants('COLABORADOR').find(
      (entry) => entry.code === 'sst.incident.report',
    );
    expect(grant).toEqual({ code: 'sst.incident.report', own: true });
  });
});
