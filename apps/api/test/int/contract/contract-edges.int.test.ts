import { contractListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Casos límite de Contratos (B24): filtros y páginas del listado, versiones viejas, el PDF que aún
// no está listo, fechas fuera del contrato y obligaciones ya cumplidas. Datos ficticios.

const scenario = new ContractScenario('contratos casos limite');

async function list(person: Person, query: string) {
  const response = await scenario.get(`/v1/contracts?${query}`, person.session);
  expect(response.status, response.text).toBe(200);
  return contractListResponseSchema.parse(response.body);
}

/** Aprobado por la Dirección, pero el worker todavía no generó su PDF. */
async function approvedWithoutPdf(sales: Person): Promise<string> {
  const id = await scenario.contract(sales);
  expect((await scenario.contractStep(sales, id, 'submit')).status).toBe(204);
  const approved = await scenario.contractStep(await scenario.director(), id, 'approve', {});
  expect(approved.status, approved.text).toBe(204);
  return id;
}

describe('listado de contratos', () => {
  it('filtra por estado, tipo y cliente, y pasa de página', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    await scenario.contract(sales);
    const { kind, party } = await scenario.contractDetail(sales, id);
    const found = await list(sales, `status=draft&kind=${kind}&party_id=${party.id}`);
    expect(found.data.map((row) => row.id)).toEqual([id]);
    const first = await list(sales, 'status=draft&limit=1');
    expect(first.next_cursor).not.toBeNull();
    const second = await list(sales, `status=draft&limit=1&cursor=${first.next_cursor ?? ''}`);
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  });
});

describe('versiones viejas del contrato', () => {
  it('no se guarda el borrador ni se aprueba sobre una versión vieja', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    const body = { ...scenario.data(), clauses: await scenario.clausesOf(sales, id) };
    const stale = await scenario.put(`/v1/contracts/${id}`, sales, body, 99);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    expect((await scenario.contractStep(sales, id, 'submit')).status).toBe(204);
    const director = await scenario.director();
    const approve = scenario.action(`/v1/contracts/${id}/actions/approve`, director, 99, {});
    expect(errorCode(await approve)).toBe('VERSION_CONFLICT');
  });
});

describe('PDF y firma del contrato', () => {
  it('sin PDF generado no se registra la firma ni se descarga la copia firmada', async () => {
    const sales = await scenario.sales();
    const id = await approvedWithoutPdf(sales);
    const signature = { file_id: await scenario.signedCopy(sales), signed_on: scenario.day(0) };
    const register = await scenario.contractStep(sales, id, 'register-signature', signature);
    expect(errorCode(register)).toBe('CONTRACT_PDF_NOT_READY');
    const signed = scenario.post(`/v1/contracts/${id}/pdf`, sales.session, { document: 'signed' });
    expect(errorCode(await signed)).toBe('CONTRACT_PDF_NOT_READY');
  });

  it('la terminación no puede tener fecha futura ni anterior al inicio', async () => {
    const sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const director = await scenario.director();
    const reason = 'El cliente cerró la operación.';
    for (const day of [scenario.day(3), scenario.day(-3)]) {
      const response = await scenario.contractStep(director, id, 'terminate', {
        terminated_on: day,
        reason,
      });
      expect(errorCode(response)).toBe('CONTRACT_DATES_INVALID');
    }
  });
});

describe('otrosíes', () => {
  it('no rigen antes del contrato ni terminan antes de regir', async () => {
    const sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const base = {
      summary: 'Se ajusta el cronograma',
      body: 'Las partes acuerdan ajustar el cronograma de entregas.',
      new_value: null,
    };
    const early = { ...base, effective_on: scenario.day(-5), new_ends_on: null };
    const short = { ...base, effective_on: scenario.day(10), new_ends_on: scenario.day(5) };
    for (const body of [early, short]) {
      const response = await scenario.post(`/v1/contracts/${id}/amendments`, sales.session, body);
      expect(errorCode(response)).toBe('CONTRACT_DATES_INVALID');
    }
  });
});
