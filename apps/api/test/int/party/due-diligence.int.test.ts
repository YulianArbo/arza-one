import { dueDiligenceListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { PartyScenario } from './support/party-scenario.js';

// Conocimiento del tercero (B13, ficha 17.3): lo registra quien atiende al tercero y lo aprueba
// Dirección, nunca la misma persona. Sin uno aprobado y vigente el tercero no está apto.

const scenario = new PartyScenario('conocimiento');
const REVIEW = { risk_level: 'medium', summary: 'Revisión de RUT, cámara de comercio y listas.' };

function act(person: Person, partyId: string, id: string, name: string, body: object = {}) {
  return scenario.post(
    `/v1/parties/${partyId}/due-diligence/${id}/actions/${name}`,
    person.session,
    body,
  );
}

describe('conocimiento del tercero', () => {
  it('Dirección lo aprueba y la ficha queda apta hasta la próxima revisión, en 12 meses', async () => {
    const sales = await scenario.sales();
    const director = await scenario.person('director', ['DIRECCION']);
    const partyId = await scenario.party(sales);
    const id = await scenario.create(`/v1/parties/${partyId}/due-diligence`, sales, REVIEW);
    expect((await scenario.detail(sales, partyId)).due_diligence.state).toBe('pending');
    expect(errorCode(await act(sales, partyId, id, 'approve'))).toBe('PERMISSION_DENIED');
    expect((await act(director, partyId, id, 'approve')).status).toBe(204);
    const { due_diligence: state } = await scenario.detail(sales, partyId);
    const year = Number(new Date().toISOString().slice(0, 4)) + 1;
    expect(state.state).toBe('approved');
    expect(state.next_review_on?.startsWith(String(year))).toBe(true);
    const list = await scenario.get(`/v1/parties/${partyId}/due-diligence`, sales.session);
    const [row] = dueDiligenceListResponseSchema.parse(list.body).data;
    expect(row).toMatchObject({ status: 'approved', risk_level: 'medium' });
    expect(row?.reviewed_by?.id).toBe(director.id);
  });

  it('quien lo registró no lo aprueba aunque tenga el permiso', async () => {
    const director = await scenario.person('director', ['DIRECCION', 'COMERCIAL']);
    const partyId = await scenario.party(director);
    const id = await scenario.create(`/v1/parties/${partyId}/due-diligence`, director, REVIEW);
    expect(errorCode(await act(director, partyId, id, 'approve'))).toBe('PARTY_SAME_REVIEWER');
  });

  it('la próxima revisión debe ser posterior a hoy y el rechazo lleva motivo', async () => {
    const sales = await scenario.sales();
    const director = await scenario.person('director', ['DIRECCION']);
    const partyId = await scenario.party(sales);
    const id = await scenario.create(`/v1/parties/${partyId}/due-diligence`, sales, REVIEW);
    const past = { next_review_on: '2020-01-01' };
    expect(errorCode(await act(director, partyId, id, 'approve', past))).toBe(
      'PARTY_NEXT_REVIEW_INVALID',
    );
    const note = { note: 'Aparece en una lista restrictiva' };
    expect((await act(director, partyId, id, 'reject', note)).status).toBe(204);
    expect((await scenario.detail(sales, partyId)).due_diligence.state).toBe('rejected');
  });
});
