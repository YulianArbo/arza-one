import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Casos límite del seguimiento de contratos (B24): decisiones de otrosíes sobre versiones viejas o
// ya tomadas, la firma y el PDF antes de tiempo, y obligaciones que no existen o ya se cumplieron.

const scenario = new ContractScenario('contratos seguimiento limites');

const MISSING = '0190a000-0000-7000-8000-000000000003';

/** Contrato vigente con un otrosí en revisión: la ruta de sus acciones y de su PDF. */
async function amendmentInReview(sales: Person) {
  const id = await scenario.activeContract(sales);
  const amendmentId = await scenario.create(`/v1/contracts/${id}/amendments`, sales, {
    summary: 'Se amplía el alcance con el módulo de pagos',
    body: 'Las partes acuerdan incluir en el objeto el módulo de pagos en línea.',
    effective_on: scenario.day(0),
    new_ends_on: null,
    new_value: '15000000.00',
  });
  const root = `/v1/contracts/${id}/amendments/${amendmentId}`;
  return { id, actions: `${root}/actions`, pdf: `${root}/pdf` };
}

async function amendmentVersion(sales: Person, contractId: string): Promise<number> {
  return (await scenario.contractDetail(sales, contractId)).amendments[0]?.version ?? 0;
}

describe('decisión y firma del otrosí', () => {
  it('pide la versión vigente, no se decide dos veces y sin PDF no se firma', async () => {
    const sales = await scenario.sales();
    const { id, actions, pdf } = await amendmentInReview(sales);
    const signature = { file_id: await scenario.signedCopy(sales), signed_on: scenario.day(0) };
    const early = scenario.action(`${actions}/register-signature`, sales, 1, signature);
    expect(errorCode(await early)).toBe('CONTRACT_STATUS_INVALID');
    const director = await scenario.director();
    const version = await amendmentVersion(sales, id);
    const stale = scenario.action(`${actions}/approve`, director, version + 5, {});
    expect(errorCode(await stale)).toBe('VERSION_CONFLICT');
    expect((await scenario.action(`${actions}/approve`, director, version, {})).status).toBe(204);
    const again = scenario.action(`${actions}/approve`, director, version + 1, {});
    expect(errorCode(await again)).toBe('CONTRACT_STATUS_INVALID');
    const current = await amendmentVersion(sales, id);
    const unsigned = scenario.action(`${actions}/register-signature`, sales, current, signature);
    expect(errorCode(await unsigned)).toBe('CONTRACT_PDF_NOT_READY');
    const copy = scenario.post(pdf, sales.session, { document: 'signed' });
    expect(errorCode(await copy)).toBe('CONTRACT_PDF_NOT_READY');
  });
});

describe('obligaciones', () => {
  it('no se cambia una que no existe ni sobre una versión vieja; cumplida ya no cambia', async () => {
    const sales = await scenario.sales();
    const id = await scenario.activeContract(sales);
    const base = `/v1/contracts/${id}/obligations`;
    const body = {
      description: 'Entregar el manual de usuario',
      responsible_id: sales.id,
      due_on: scenario.day(20),
    };
    const obligation = await scenario.create(base, sales, body);
    const missing = await scenario.put(`${base}/${MISSING}`, sales, body, 1);
    expect(errorCode(missing)).toBe('CONTRACT_NOT_FOUND');
    const moved = { ...body, due_on: scenario.day(25) };
    expect(errorCode(await scenario.put(`${base}/${obligation}`, sales, moved, 9))).toBe(
      'VERSION_CONFLICT',
    );
    const complete = `${base}/${obligation}/actions/complete`;
    const note = { note: 'Entregado.' };
    expect(errorCode(await scenario.action(complete, sales, 9, note))).toBe('VERSION_CONFLICT');
    expect((await scenario.action(complete, sales, 1, note)).status).toBe(204);
    expect(errorCode(await scenario.action(complete, sales, 2, note))).toBe(
      'CONTRACT_STATUS_INVALID',
    );
    expect(errorCode(await scenario.put(`${base}/${obligation}`, sales, moved, 2))).toBe(
      'CONTRACT_STATUS_INVALID',
    );
  });
});
