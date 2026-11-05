import { clauseListSchema, contractListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Permiso denegado, «solo lo propio» y aislamiento entre empresas de Contratos (B24, capítulo 21 y
// numerales 15.3 y 15.5), y la biblioteca de cláusulas, que solo administra la Dirección.

const scenario = new ContractScenario('contratos acceso');

describe('permiso denegado', () => {
  it('el portal y el Oficial de datos no ven contratos; el Contador lee pero no crea', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    for (const person of [
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
      await scenario.person('datos', ['OFICIAL_DATOS']),
    ]) {
      expect(errorCode(await scenario.get('/v1/contracts', person.session))).toBe(
        'PERMISSION_DENIED',
      );
    }
    const accountant = await scenario.person('contador', ['CONTADOR']);
    expect((await scenario.get(`/v1/contracts/${id}`, accountant.session)).status).toBe(200);
    const writes = [
      scenario.post('/v1/contracts', accountant.session, {}),
      scenario.contractStep(accountant, id, 'submit'),
      scenario.post(`/v1/contracts/${id}/obligations`, accountant.session, {}),
    ];
    for (const response of await Promise.all(writes)) {
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado', () => {
  it('el Colaborador solo ve los contratos de los que es responsable', async () => {
    const sales = await scenario.sales();
    const worker = await scenario.person('colaborador', ['COLABORADOR']);
    const others = await scenario.contract(sales);
    const mine = await scenario.contract(sales, { responsible_id: worker.id });
    const list = contractListResponseSchema.parse(
      (await scenario.get('/v1/contracts?limit=200', worker.session)).body,
    );
    expect(list.data.map((row) => row.id)).toContain(mine);
    expect(list.data.map((row) => row.id)).not.toContain(others);
    expect((await scenario.get(`/v1/contracts/${mine}`, worker.session)).status).toBe(200);
    expect(errorCode(await scenario.get(`/v1/contracts/${others}`, worker.session))).toBe(
      'CONTRACT_NOT_FOUND',
    );
  });
});

const CLAUSES = '/v1/contract-clauses';

function newClause() {
  return {
    key: `penal-${crypto.randomUUID().slice(0, 8)}`,
    title: 'Cláusula penal',
    body: 'Si {{cliente_nombre}} incumple, pagará una pena del 10 %.',
    numbered: true,
    legal_validated: false,
  };
}

describe('biblioteca de cláusulas', () => {
  it('solo la Dirección agrega; con variables desconocidas o clave repetida no se guarda', async () => {
    const sales = await scenario.sales();
    const clause = newClause();
    expect(errorCode(await scenario.post(CLAUSES, sales.session, clause))).toBe(
      'PERMISSION_DENIED',
    );
    const director = await scenario.director();
    const bad = await scenario.post(CLAUSES, director.session, {
      ...clause,
      body: 'Pague {{multa}} ya.',
    });
    expect(errorCode(bad)).toBe('CONTRACT_CLAUSE_VARIABLE_UNKNOWN');
    expect((await scenario.post(CLAUSES, director.session, clause)).status).toBe(204);
    expect(errorCode(await scenario.post(CLAUSES, director.session, clause))).toBe(
      'CONTRACT_CLAUSE_DUPLICATE',
    );
  });
});

describe('biblioteca de cláusulas', () => {
  it('cambiar una cláusula crea su versión siguiente, aprobada por la Dirección', async () => {
    const director = await scenario.director();
    const clause = newClause();
    expect((await scenario.post(CLAUSES, director.session, clause)).status).toBe(204);
    const version = { ...clause, body: 'Si {{cliente_nombre}} incumple, pagará el 5 %.' };
    const { key, ...changes } = version;
    const response = await scenario.post(`${CLAUSES}/${key}/versions`, director.session, changes);
    expect(response.status, response.text).toBe(204);
    const list = clauseListSchema.parse((await scenario.get(CLAUSES, director.session)).body);
    expect(list.data.find((row) => row.key === key)).toMatchObject({
      version: 2,
      approved_by: { id: director.id },
    });
    expect(list.data.find((row) => row.key === 'firma-electronica')).toMatchObject({
      legal_validated: false,
      templates: ['CT-COM-001', 'CT-COM-002', 'CT-COM-003', 'OS-COM-001'],
    });
  });
});

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve, no edita ni aprueba los contratos de esta', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales);
    await scenario.contractStep(sales, id, 'submit');
    const outsider = await scenario.person('comercial-otra', ['COMERCIAL'], {
      tenantId: scenario.otherTenant.id,
    });
    const director = await scenario.person('direccion-otra', ['DIRECCION'], {
      tenantId: scenario.otherTenant.id,
    });
    expect(errorCode(await scenario.get(`/v1/contracts/${id}`, outsider.session))).toBe(
      'CONTRACT_NOT_FOUND',
    );
    const list = contractListResponseSchema.parse(
      (await scenario.get('/v1/contracts?limit=200', outsider.session)).body,
    );
    expect(list.data.map((row) => row.id)).not.toContain(id);
    const approve = await scenario.action(`/v1/contracts/${id}/actions/approve`, director, 2, {});
    expect(errorCode(approve)).toBe('CONTRACT_NOT_FOUND');
    const obligation = await scenario.post(`/v1/contracts/${id}/obligations`, outsider.session, {
      description: 'Intrusa',
      responsible_id: outsider.id,
      due_on: scenario.day(3),
    });
    expect(errorCode(obligation)).toBe('CONTRACT_NOT_FOUND');
  });
});

describe('aislamiento entre empresas', () => {
  it('un contrato no usa el cliente ni la plantilla de otra empresa', async () => {
    const sales = await scenario.sales();
    const outsider = await scenario.person('comercial-otra-2', ['COMERCIAL'], {
      tenantId: scenario.otherTenant.id,
    });
    const foreignParty = await scenario.client(sales);
    const foreignTemplate = await scenario.templateId(sales);
    const ownTemplate = await scenario.templateId(outsider);
    const ownParty = await scenario.client(outsider);
    expect(ownTemplate).not.toBe(foreignTemplate);
    const cases: [object, string][] = [
      [scenario.body(ownTemplate, foreignParty), 'CONTRACT_PARTY_INVALID'],
      [scenario.body(foreignTemplate, ownParty), 'CONTRACT_TEMPLATE_INVALID'],
    ];
    for (const [body, code] of cases) {
      expect(errorCode(await scenario.post('/v1/contracts', outsider.session, body))).toBe(code);
    }
  });
});
