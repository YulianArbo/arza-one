import { fitsModel } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ContractScenario } from './support/contract-scenario.js';

// Generación de contratos desde las plantillas (B24, ficha 17.7). Primer criterio del bloque: un
// contrato generado es idéntico al modelo salvo las variables.

const scenario = new ContractScenario('contratos generación');

async function libraryBodies(): Promise<Map<string, string>> {
  const rows = await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) => tx.ctrClause.findMany({ where: { clauseVersion: 1 } }));
  return new Map(rows.map((row) => [row.key, row.body]));
}

describe('un contrato generado es idéntico al modelo salvo las variables', () => {
  it.each(['CT-COM-001', 'CT-COM-002', 'CT-COM-003', 'OS-COM-001'])('%s', async (code) => {
    const sales = await scenario.sales();
    const value = code === 'CT-COM-003' ? { value: null, payment_terms: null } : {};
    const id = await scenario.contract(sales, value, code);
    const contract = await scenario.contractDetail(sales, id);
    const library = await libraryBodies();
    expect(contract.status).toBe('draft');
    expect(contract.has_modified_clauses).toBe(false);
    const template = (await scenario.options(sales)).templates.find((item) => item.code === code);
    expect(contract.clauses.map((clause) => clause.clause_key)).toEqual(
      template?.clauses.map((clause) => clause.key),
    );
    for (const clause of contract.clauses) {
      expect(clause.origin).toBe('library');
      expect(fitsModel(library.get(clause.clause_key ?? '') ?? '', clause.body), clause.title).toBe(
        true,
      );
      expect(clause.body).not.toMatch(/\{\{/u);
    }
  });
});

describe('las variables salen del cliente, de la empresa y del asistente', () => {
  it('llena el cliente, el valor en letras, las fechas y el código; numera las cláusulas', async () => {
    const sales = await scenario.sales();
    const id = await scenario.contract(sales, { value: '10000000.00' });
    const contract = await scenario.contractDetail(sales, id);
    expect(contract.code).toMatch(/^CTR-\d{4}-\d{4,}$/u);
    const [parties, object, value] = contract.clauses;
    expect(parties).toMatchObject({ ordinal: null, title: 'Partes' });
    expect(parties?.body).toContain(contract.party.name);
    expect(parties?.body).toContain(contract.code);
    expect(parties?.body).toContain('Laura Gómez, identificado con CC 43000000');
    expect(object?.ordinal).toBe('PRIMERA');
    expect(object?.body).toContain('desarrollar el portal de autogestión de los clientes');
    expect(value?.body).toContain('DIEZ MILLONES DE PESOS M/CTE. ($ 10.000.000,00)');
    const [year, month, day] = scenario.day(0).split('-');
    expect(contract.clauses.find((clause) => clause.clause_key === 'plazo')?.body).toContain(
      `${day ?? ''}/${month ?? ''}/${year ?? ''}`,
    );
  });

  it('la orden de servicio lleva el código OS y el acuerdo de confidencialidad puede ir sin valor', async () => {
    const sales = await scenario.sales();
    const order = await scenario.contract(sales, {}, 'OS-COM-001');
    expect((await scenario.contractDetail(sales, order)).code).toMatch(/^OS-\d{4}-\d{4,}$/u);
    const nda = await scenario.contract(sales, { value: null, payment_terms: null }, 'CT-COM-003');
    expect(await scenario.contractDetail(sales, nda)).toMatchObject({ kind: 'nda', value: null });
  });
});

describe('lo que el asistente no acepta', () => {
  it('sin valor (salvo confidencialidad), fechas al revés, cliente o plantilla que no existen', async () => {
    const sales = await scenario.sales();
    const template = await scenario.templateId(sales);
    const party = await scenario.client(sales);
    const cases: [object, string][] = [
      [{ value: null }, 'CONTRACT_VALUE_REQUIRED'],
      [{ ends_on: scenario.day(0), starts_on: scenario.day(5) }, 'CONTRACT_DATES_INVALID'],
      [{ party_id: crypto.randomUUID() }, 'CONTRACT_PARTY_INVALID'],
      [{ template_id: crypto.randomUUID() }, 'CONTRACT_TEMPLATE_INVALID'],
      [{ quote_id: crypto.randomUUID() }, 'CONTRACT_QUOTE_INVALID'],
      [{ responsible_id: crypto.randomUUID() }, 'CONTRACT_RESPONSIBLE_INVALID'],
    ];
    for (const [overrides, code] of cases) {
      const response = await scenario.post(
        '/v1/contracts',
        sales.session,
        scenario.body(template, party, overrides),
      );
      expect(errorCode(response), code).toBe(code);
    }
  });
});

describe('desde la cotización aceptada', () => {
  it('el asistente trae el cliente, el valor y lo cotizado, y el contrato la cita', async () => {
    const sales = await scenario.sales();
    const { id: quoteId, token } = await scenario.sent(sales);
    const accept = { token, accepted_by_name: 'Clara Cliente', accept: true };
    expect((await scenario.public('accept', accept)).status).toBe(204);
    const quote = await scenario.quoteDetail(sales, quoteId);
    const options = await scenario.options(sales, `?quote_id=${quoteId}`);
    expect(options.quote).toMatchObject({
      id: quoteId,
      code: quote.code,
      value: quote.total,
      party: { id: quote.party.id },
    });
    const template = await scenario.templateId(sales);
    const body = scenario.body(template, quote.party.id, {
      quote_id: quoteId,
      value: quote.total,
    });
    const id = await scenario.create('/v1/contracts', sales, body);
    const contract = await scenario.contractDetail(sales, id);
    expect(contract.quote).toMatchObject({ id: quoteId, code: quote.code });
    expect(contract.clauses[1]?.body).toContain(`la cotización ${quote.code} versión 1`);
  });

  it('no usa una cotización sin aceptar ni la de otro cliente', async () => {
    const sales = await scenario.sales();
    const quoteId = await scenario.quote(sales);
    const response = await scenario.post(
      '/v1/contracts',
      sales.session,
      scenario.body(await scenario.templateId(sales), await scenario.client(sales), {
        quote_id: quoteId,
      }),
    );
    expect(errorCode(response)).toBe('CONTRACT_QUOTE_INVALID');
  });
});
