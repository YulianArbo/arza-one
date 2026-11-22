import { describe, expect, it } from 'vitest';

import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { actionTypeOf, createQmsActionSchema } from './actions.js';
import {
  addFindingSchema,
  canAuditStep,
  findingOpensNonconformity,
  saveChecklistSchema,
} from './audits.js';
import {
  meetsTarget,
  periodEndOf,
  periodLabel,
  periodStartOf,
  previousPeriodStart,
  recordMeasurementSchema,
  saveIndicatorSchema,
  trendOf,
} from './indicators.js';
import { createManagementReviewSchema, updateManagementReviewSchema } from './reviews.js';

const ID = '01900000-0000-7000-8000-000000000001';

function grant(role: SystemRoleCode, code: string) {
  return systemRoleGrants(role).find((item) => item.code === code) ?? null;
}

describe('periodos de los indicadores', () => {
  it('ubica la fecha en su periodo y calcula el siguiente', () => {
    expect(periodStartOf('monthly', '2026-11-21')).toBe('2026-11-01');
    expect(periodStartOf('quarterly', '2026-11-21')).toBe('2026-10-01');
    expect(periodStartOf('semiannual', '2026-05-02')).toBe('2026-01-01');
    expect(periodStartOf('annual', '2026-11-21')).toBe('2026-01-01');
    expect(periodEndOf('monthly', '2026-12-01')).toBe('2027-01-01');
    expect(periodEndOf('quarterly', '2026-10-01')).toBe('2027-01-01');
  });

  it('el periodo anterior cruza el año', () => {
    expect(previousPeriodStart('monthly', '2026-01-05')).toBe('2025-12-01');
    expect(previousPeriodStart('quarterly', '2026-02-10')).toBe('2025-10-01');
    expect(previousPeriodStart('semiannual', '2026-07-01')).toBe('2026-01-01');
    expect(previousPeriodStart('annual', '2026-07-01')).toBe('2025-01-01');
  });

  it('nombra el periodo como se lee en Colombia', () => {
    expect(periodLabel('monthly', '2026-03-01')).toBe('03/2026');
    expect(periodLabel('quarterly', '2026-10-01')).toBe('T4 2026');
    expect(periodLabel('semiannual', '2026-07-01')).toBe('S2 2026');
    expect(periodLabel('annual', '2026-01-01')).toBe('2026');
  });
});

describe('meta y tendencia (decisión 8)', () => {
  it('cumple según convenga que suba o que baje, incluido el borde', () => {
    expect(meetsTarget('90', '90', 'higher_better')).toBe(true);
    expect(meetsTarget('89.9999', '90', 'higher_better')).toBe(false);
    expect(meetsTarget('3', '3', 'lower_better')).toBe(true);
    expect(meetsTarget('4', '3', 'lower_better')).toBe(false);
  });

  it('compara con la medición anterior', () => {
    expect(trendOf('5', null)).toBeNull();
    expect(trendOf('5', '4.5')).toBe('up');
    expect(trendOf('4', '4.0000')).toBe('steady');
    expect(trendOf('3', '4')).toBe('down');
  });
});

describe('ficha y medición', () => {
  const base = {
    process_id: ID,
    name: 'Acciones eficaces',
    objective: 'Que las acciones eliminen la causa',
    formula: 'Eficaces ÷ verificadas',
    target: '80',
    direction: 'higher_better',
    frequency: 'quarterly',
    responsible_id: ID,
  };

  it('el cálculo automático exige su unidad', () => {
    expect(
      saveIndicatorSchema.safeParse({ ...base, unit: 'percent', source: 'qms_actions_effective' })
        .success,
    ).toBe(true);
    expect(
      saveIndicatorSchema.safeParse({ ...base, unit: 'count', source: 'qms_actions_effective' })
        .success,
    ).toBe(false);
    expect(saveIndicatorSchema.safeParse({ ...base, unit: 'days', source: 'manual' }).success).toBe(
      true,
    );
  });

  it('la medición manual exige análisis y evidencia, y un valor sin signo', () => {
    const measurement = {
      period_start: '2026-10-01',
      value: '12.5',
      analysis: 'Se cumplió la meta',
      evidence_note: 'Informe del mes',
    };
    expect(recordMeasurementSchema.safeParse(measurement).success).toBe(true);
    expect(recordMeasurementSchema.safeParse({ ...measurement, value: '-1' }).success).toBe(false);
    expect(recordMeasurementSchema.safeParse({ ...measurement, evidence_note: '' }).success).toBe(
      false,
    );
  });
});

describe('auditorías', () => {
  it('sigue el flujo programada → en ejecución → informe → cerrada', () => {
    expect(canAuditStep('start', 'planned')).toBe(true);
    expect(canAuditStep('finding', 'planned')).toBe(false);
    expect(canAuditStep('report', 'in_progress')).toBe(true);
    expect(canAuditStep('close', 'reported')).toBe(true);
    expect(canAuditStep('cancel', 'reported')).toBe(false);
  });

  it('solo los hallazgos de no conformidad abren no conformidad (decisión 3)', () => {
    expect(findingOpensNonconformity('major')).toBe(true);
    expect(findingOpensNonconformity('minor')).toBe(true);
    expect(findingOpensNonconformity('observation')).toBe(false);
    expect(findingOpensNonconformity('opportunity')).toBe(false);
  });

  it('el hallazgo exige evidencia y la lista de chequeo al menos una pregunta', () => {
    const finding = {
      type: 'minor',
      requirement: 'ISO 9001 8.5.1',
      description: 'Falta el registro de liberación',
    };
    expect(addFindingSchema.safeParse(finding).success).toBe(false);
    expect(addFindingSchema.safeParse({ ...finding, evidence: 'Muestra de 5 OS' }).success).toBe(
      true,
    );
    expect(saveChecklistSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('revisión por la dirección', () => {
  it('el periodo no termina antes de empezar', () => {
    const review = { period_from: '2026-01-01', meeting_on: '2026-12-10', attendees: 'Dirección' };
    expect(
      createManagementReviewSchema.safeParse({ ...review, period_to: '2026-11-30' }).success,
    ).toBe(true);
    expect(
      createManagementReviewSchema.safeParse({ ...review, period_to: '2025-12-31' }).success,
    ).toBe(false);
  });

  it('las decisiones llevan responsable y fecha', () => {
    const update = { attendees: 'Dirección y Calidad' };
    expect(
      updateManagementReviewSchema.safeParse({
        ...update,
        decisions: [{ description: 'Contratar un analista', due_on: '2027-01-31' }],
      }).success,
    ).toBe(false);
  });
});

describe('permisos de B39', () => {
  it('cualquier colaborador ejecuta solo sus auditorías; el Auditor solo lee (decisión 1)', () => {
    expect(grant('COLABORADOR', 'qms.audit.execute')).toEqual({
      code: 'qms.audit.execute',
      own: true,
    });
    expect(grant('CALIDAD', 'qms.audit.execute')).toEqual({
      code: 'qms.audit.execute',
      own: false,
    });
    expect(grant('AUDITOR', 'qms.audit.execute')).toBeNull();
  });

  it('solo la Dirección aprueba el acta (decisión 5)', () => {
    expect(grant('DIRECCION', 'qms.review.approve')).not.toBeNull();
    expect(grant('CALIDAD', 'qms.review.approve')).toBeNull();
    expect(grant('CALIDAD', 'qms.review.manage')).not.toBeNull();
  });

  it('las acciones de auditoría y de revisión son de mejora y no se registran a mano', () => {
    expect(actionTypeOf('audit')).toBe('improvement');
    expect(actionTypeOf('management_review')).toBe('improvement');
    expect(
      createQmsActionSchema.safeParse({
        origin_type: 'audit',
        origin_id: ID,
        description: 'Ajustar el formato',
        responsible_id: ID,
        due_on: '2026-12-01',
      }).success,
    ).toBe(false);
  });
});
