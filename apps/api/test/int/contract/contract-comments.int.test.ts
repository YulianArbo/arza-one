import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Comentarios del expediente contractual (B16, B24): se comenta un contrato que la persona ve; uno
// que no existe, para ella no existe.

const scenario = new ContractScenario('contratos comentarios');

describe('comentarios del contrato', () => {
  it('se comenta un contrato visible y no uno que no existe', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    const body = { entity_type: 'ctr_contract', body: 'Revisé el valor con el cliente.' };
    const ok = await scenario.post('/v1/comments', sales.session, { ...body, entity_id: id });
    expect(ok.status, ok.text).toBe(201);
    const missing = await scenario.post('/v1/comments', sales.session, {
      ...body,
      entity_id: '0190a000-0000-7000-8000-000000000005',
    });
    expect(errorCode(missing)).toBe('NTF_RECORD_NOT_FOUND');
  });
});
