import { describe, expect, it } from 'vitest';

import { systemRoleGrants, type SystemRoleCode } from '../iam/role-matrix.js';
import { PERMISSION_GROUPS } from '../iam/permissions.js';
import {
  evaluateLegalRequirementSchema,
  legalPeriodLabel,
  legalPeriodStart,
  resultNeedsAction,
  saveLegalRequirementSchema,
} from '../qms/legal.js';
import { saveStrategicObjectiveSchema } from '../qms/strategy.js';
import { scorecardStatusOf } from './dashboards.js';
import {
  DASHBOARD_FIGURES,
  DASHBOARD_PERMISSIONS,
  SOD_CONFLICTS,
  sodConflictsOf,
} from './figures.js';

const ID = '01900000-0000-7000-8000-000000000001';
const CODES = new Set<string>(
  PERMISSION_GROUPS.flatMap((group) => group.entries.map((entry) => entry[0])),
);

function codesOf(role: SystemRoleCode): Set<string> {
  return new Set(systemRoleGrants(role).map((grant) => grant.code));
}

describe('fichas de las cifras', () => {
  it('cada cifra pide un permiso que existe y explica su cálculo', () => {
    for (const figure of Object.values(DASHBOARD_FIGURES)) {
      expect(CODES.has(figure.source)).toBe(true);
      expect(figure.how.length).toBeGreaterThan(20);
      expect(figure.link.startsWith('/app/')).toBe(true);
    }
    for (const permission of Object.values(DASHBOARD_PERMISSIONS)) {
      expect(CODES.has(permission)).toBe(true);
    }
  });

  it('la Dirección, Calidad y el Auditor ven los tres tableros; un colaborador ninguno', () => {
    for (const role of ['DIRECCION', 'CALIDAD', 'AUDITOR'] as const) {
      const codes = codesOf(role);
      expect(Object.values(DASHBOARD_PERMISSIONS).every((code) => codes.has(code))).toBe(true);
    }
    const collaborator = codesOf('COLABORADOR');
    expect(Object.values(DASHBOARD_PERMISSIONS).some((code) => collaborator.has(code))).toBe(false);
  });
});

describe('segregación de funciones', () => {
  it('los pares usan permisos del catálogo', () => {
    for (const conflict of SOD_CONFLICTS) {
      expect(conflict.permissions.every((code) => CODES.has(code))).toBe(true);
    }
  });

  it('encuentra solo los pares completos', () => {
    const found = sodConflictsOf(
      new Set(['iam.role.manage', 'iam.role.assign', 'finance.invoice.request']),
    );
    expect(found.map((conflict) => conflict.key)).toEqual(['roles']);
    expect(sodConflictsOf(new Set())).toEqual([]);
  });
});

describe('estado de un objetivo del cuadro de mando', () => {
  it('resume sus indicadores medidos', () => {
    expect(scorecardStatusOf([])).toBe('no_data');
    expect(scorecardStatusOf([null])).toBe('no_data');
    expect(scorecardStatusOf([true, null])).toBe('meets');
    expect(scorecardStatusOf([true, false])).toBe('partial');
    expect(scorecardStatusOf([false])).toBe('fails');
  });

  it('el año final no es anterior al inicial', () => {
    const base = { perspective: 'customer', name: 'Clientes más satisfechos', year_from: 2026 };
    expect(saveStrategicObjectiveSchema.safeParse({ ...base, year_to: 2028 }).success).toBe(true);
    expect(saveStrategicObjectiveSchema.safeParse({ ...base, year_to: 2025 }).success).toBe(false);
  });
});

describe('normograma', () => {
  it('ubica la evaluación en su semestre', () => {
    expect(legalPeriodStart('2026-05-31')).toBe('2026-01-01');
    expect(legalPeriodStart('2026-11-26')).toBe('2026-07-01');
    expect(legalPeriodLabel('2026-07-01')).toBe('S2 2026');
  });

  it('un resultado parcial o negativo exige su acción, y los demás no la llevan', () => {
    expect(resultNeedsAction('partial')).toBe(true);
    expect(resultNeedsAction('fails')).toBe(true);
    expect(resultNeedsAction('complies')).toBe(false);
    const base = { evaluated_on: '2026-11-26', evidence_note: 'Se revisó la política publicada.' };
    const action = { description: 'Publicar el aviso', responsible_id: ID, due_on: '2026-12-15' };
    const check = (input: object) => evaluateLegalRequirementSchema.safeParse(input).success;
    expect(check({ ...base, result: 'complies' })).toBe(true);
    expect(check({ ...base, result: 'fails' })).toBe(false);
    expect(check({ ...base, result: 'fails', action })).toBe(true);
    expect(check({ ...base, result: 'not_applicable', action })).toBe(false);
  });

  it('el requisito aplica por omisión y no lleva proceso ni responsable obligatorios', () => {
    const parsed = saveLegalRequirementSchema.parse({
      norm_type: 'law',
      norm: 'Ley 1581 de 2012',
      issuer: 'Congreso de la República',
      requirement: 'Tratar los datos personales con autorización previa.',
    });
    expect(parsed).toMatchObject({ applies: true, process_id: null, responsible_id: null });
  });
});
