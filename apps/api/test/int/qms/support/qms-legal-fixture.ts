import {
  LEGAL_IMPORT_COLUMNS,
  legalRequirementListResponseSchema,
  type LegalRequirementList,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { coded, later, today, type QualityStaff } from './qms-fixture.js';

// Registros de prueba del normograma y de los objetivos estratégicos (B46). Normas ficticias con
// un sufijo único para que las pruebas de la misma empresa no choquen.

export function requirementBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    norm_type: 'law',
    norm: `Ley de prueba ${uuidv7().slice(-8)}`,
    issuer: 'Congreso de la República',
    article: 'Art. 1',
    requirement: 'Requisito ficticio para las pruebas automáticas.',
    compliance_means: 'Procedimiento de prueba.',
    ...overrides,
  };
}

export async function requirement(
  s: AccessScenario,
  f: QualityStaff,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; code: string }> {
  return coded(
    await s.post('/v1/qms/legal-requirements', f.quality.session, requirementBody(overrides)),
  );
}

export function complies(s: AccessScenario): Record<string, unknown> {
  return {
    evaluated_on: today(s),
    result: 'complies',
    evidence_note: 'Se revisó la evidencia publicada.',
  };
}

export function fails(s: AccessScenario, responsibleId: string): Record<string, unknown> {
  return {
    evaluated_on: today(s),
    result: 'fails',
    evidence_note: 'No se encontró la evidencia.',
    action: {
      description: 'Publicar la evidencia que falta.',
      responsible_id: responsibleId,
      due_on: later(s, 30),
    },
  };
}

export async function normograma(s: AccessScenario, person: Person): Promise<LegalRequirementList> {
  const response = await s.get('/v1/qms/legal-requirements', person.session);
  if (response.status !== 200) throw new Error(response.text);
  return legalRequirementListResponseSchema.parse(response.body);
}

/** Un archivo CSV del normograma con las filas dadas (punto y coma). */
export function legalCsv(rows: readonly (readonly string[])[]): string {
  return [LEGAL_IMPORT_COLUMNS.join(';'), ...rows.map((row) => row.join(';'))].join('\r\n');
}

export function objectiveBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    perspective: 'customer',
    name: 'Clientes más satisfechos',
    description: 'Objetivo ficticio del plan estratégico.',
    year_from: 2026,
    year_to: 2028,
    ...overrides,
  };
}
