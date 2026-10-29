import {
  serviceListResponseSchema,
  taxParameterHistoryResponseSchema,
  taxParameterListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { QuoteScenario, item } from './support/quote-scenario.js';

// Portafolio de servicios y parámetros tributarios vigentes (B23, ficha 17.6 y numeral 12.4).

const scenario = new QuoteScenario('crm portafolio e impuestos');

function serviceBody(overrides: object = {}): Record<string, unknown> {
  return {
    name: `Desarrollo a la medida ${String(Date.now())}${String(Math.random()).slice(2, 6)}`,
    description: 'Horas de desarrollo con el equipo de ARZA TECH.',
    unit: 'hour',
    base_price: '95000',
    tax_key: 'IVA_GENERAL',
    ...overrides,
  };
}

describe('portafolio', () => {
  it('agrega un servicio con su código, no repite nombres y lo desactiva sin borrarlo', async () => {
    const sales = await scenario.sales();
    const body = serviceBody();
    const id = await scenario.create('/v1/crm/services', sales, body);
    expect(errorCode(await scenario.post('/v1/crm/services', sales.session, body))).toBe(
      'CRM_SERVICE_DUPLICATE',
    );
    const badTax = serviceBody({ tax_key: 'NO_EXISTE' });
    expect(errorCode(await scenario.post('/v1/crm/services', sales.session, badTax))).toBe(
      'CRM_TAX_INVALID',
    );
    const updated = await scenario.put(
      `/v1/crm/services/${id}`,
      sales,
      { ...body, base_price: '99000', is_active: false },
      1,
    );
    expect(updated.status, updated.text).toBe(204);
    const active = serviceListResponseSchema.parse(
      (await scenario.get('/v1/crm/services', sales.session)).body,
    );
    expect(active.data.map((row) => row.id)).not.toContain(id);
    const all = serviceListResponseSchema.parse(
      (await scenario.get('/v1/crm/services?view=all', sales.session)).body,
    );
    expect(all.data.find((row) => row.id === id)).toMatchObject({
      base_price: '99000.00',
      is_active: false,
    });
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'crm.service.create:success',
      'crm.service.update:success',
    ]);
  });
});

const TAXES = '/v1/finance/tax-parameters/versions';

/** Impuesto nuevo con dos tarifas: 5 % desde hoy y 8 % dentro de diez días. */
async function reducedTax(key: string) {
  const accountant = await scenario.person('contador', ['CONTADOR']);
  const body = {
    key,
    label: 'IVA reducido',
    rate: '5',
    valid_from: scenario.day(0),
    legal_basis: 'Estatuto Tributario, art. 468-1.',
  };
  const created = await scenario.post(TAXES, accountant.session, body);
  expect(created.status, created.text).toBe(204);
  const later = { ...body, label: null, rate: '8', valid_from: scenario.day(10) };
  expect((await scenario.post(TAXES, accountant.session, later)).status).toBe(204);
  return { accountant, body };
}

describe('parámetros tributarios', () => {
  it('una tarifa nueva conserva la anterior, deja auditoría y no reescribe el pasado', async () => {
    const { accountant, body } = await reducedTax('IVA_REDUCIDO');
    const historyPath = '/v1/finance/tax-parameters/IVA_REDUCIDO/history';
    const history = taxParameterHistoryResponseSchema.parse(
      (await scenario.get(historyPath, accountant.session)).body,
    );
    expect(history.data.map((version) => [version.rate, version.valid_to])).toEqual([
      ['8.00', null],
      ['5.00', scenario.day(9)],
    ]);
    const past = { ...body, label: null, valid_from: scenario.day(-1) };
    expect(errorCode(await scenario.post(TAXES, accountant.session, past))).toBe(
      'FIN_TAX_VALID_FROM_INVALID',
    );
    const unnamed = { ...body, key: 'OTRO_NUEVO', label: null };
    expect((await scenario.post(TAXES, accountant.session, unnamed)).status).toBe(422);
    const event = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.auditEvent.findFirstOrThrow({
        where: {
          action: 'finance.tax_parameter.update',
          changes: { path: ['rate', 'to'], equals: '8.00' },
        },
      }),
    );
    expect(event.changes).toMatchObject({ rate: { from: '5.00', to: '8.00' } });
  });
});

describe('parámetros tributarios', () => {
  it('las cotizaciones usan la tarifa vigente hoy, no la programada', async () => {
    const { accountant } = await reducedTax('IVA_REBAJADO');
    const list = taxParameterListResponseSchema.parse(
      (await scenario.get('/v1/finance/tax-parameters', accountant.session)).body,
    );
    expect(list.data.find((tax) => tax.key === 'IVA_REBAJADO')).toMatchObject({
      current: { rate: '5.00' },
      scheduled: { rate: '8.00' },
    });
    const sales = await scenario.sales();
    const quote = await scenario.quote(sales, {
      items: [item({ tax_key: 'IVA_REBAJADO', quantity: '7', unit_price: '12345.67' })],
    });
    expect(await scenario.quoteDetail(sales, quote)).toMatchObject({
      tax_total: '4320.98',
      total: '90740.67',
    });
  });
});
