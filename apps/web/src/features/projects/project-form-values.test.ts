import { describe, expect, it } from 'vitest';

import {
  EMPTY_VALUES,
  createBody,
  createProblems,
  updateBody,
  updateProblems,
  valuesFromContract,
} from './project-form-values';

// Lo que se escribe en el asistente y la edición del proyecto (B26) y cómo llega a la API.

const LEADER = '01999a00-0000-7000-8000-00000000a001';
const CONTRACT = {
  id: '01999a00-0000-7000-8000-0000000d0001',
  code: 'CTR-2026-0001',
  title: 'Portal de clientes',
  party: { id: '01999a00-0000-7000-8000-00000000f001', name: 'Andina' },
  starts_on: '2026-11-01',
  ends_on: '2027-10-31',
  value: null,
};

describe('valores del proyecto', () => {
  it('el contrato llena cliente, fechas y valor; quitarlo deja el resto', () => {
    const filled = valuesFromContract({ ...EMPTY_VALUES, name: 'Propio' }, CONTRACT);
    expect(filled).toMatchObject({ name: 'Propio', budgetAmount: '', endsOn: '2027-10-31' });
    expect(valuesFromContract(filled, undefined).contractId).toBe('');
  });

  it('las horas aceptan coma y lo ilegible llega como texto para que la API lo rechace', () => {
    const values = { ...valuesFromContract(EMPTY_VALUES, CONTRACT), managerId: LEADER };
    expect(createBody({ ...values, budgetHours: '12,5' })).toMatchObject({
      contract_id: CONTRACT.id,
      party_id: null,
      budget_hours: 12.5,
    });
    expect(updateBody({ ...values, budgetHours: 'mucho' })).toMatchObject({
      budget_hours: 'mucho',
    });
  });

  it('avisa fechas al revés en el asistente y en la edición', () => {
    const reversed = {
      ...EMPTY_VALUES,
      partyId: CONTRACT.party.id,
      name: 'Portal',
      startsOn: '2026-12-01',
      endsOn: '2026-11-01',
      budgetHours: '10',
      managerId: LEADER,
    };
    expect(createProblems(reversed)['ends_on']).toMatch(/posterior/u);
    expect(updateProblems(reversed)['ends_on']).toMatch(/posterior/u);
    expect(createProblems({ ...reversed, endsOn: '2026-12-31' })).toEqual({});
  });
});
