import {
  funnelReportSchema,
  opportunityListResponseSchema,
  serviceListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { QuoteScenario, item } from './support/quote-scenario.js';

// Bordes del portafolio, las oportunidades y las cotizaciones (B23): búsquedas, filtros y los
// errores de versión, de impuesto y de PDF que la ficha muestra al usuario.

const scenario = new QuoteScenario('crm bordes de cotizaciones');

function serviceBody(name: string, overrides: object = {}): Record<string, unknown> {
  return {
    name,
    description: 'Horas de consultoría.',
    unit: 'hour',
    base_price: '90000',
    tax_key: 'IVA_GENERAL',
    ...overrides,
  };
}

describe('servicios del portafolio', () => {
  it('busca por nombre y rechaza cambios sobre versiones viejas, impuestos y servicios que no existen', async () => {
    const sales = await scenario.sales();
    const name = `Consultoría ${String(Date.now())}`;
    const id = await scenario.create('/v1/crm/services', sales, serviceBody(name));
    const found = serviceListResponseSchema.parse(
      (await scenario.get(`/v1/crm/services?q=${encodeURIComponent(name)}`, sales.session)).body,
    );
    expect(found.data.map((row) => row.id)).toEqual([id]);
    const badTax = serviceBody(name, { tax_key: 'NO_EXISTE' });
    expect(errorCode(await scenario.put(`/v1/crm/services/${id}`, sales, badTax, 1))).toBe(
      'CRM_TAX_INVALID',
    );
    const stale = serviceBody(name, { base_price: '91000' });
    expect(errorCode(await scenario.put(`/v1/crm/services/${id}`, sales, stale, 9))).toBe(
      'VERSION_CONFLICT',
    );
    const missing = await scenario.put(
      '/v1/crm/services/0190a000-0000-7000-8000-000000000000',
      sales,
      stale,
      1,
    );
    expect(errorCode(missing)).toBe('CRM_NOT_FOUND');
  });
});

describe('filtros de oportunidades', () => {
  it('filtra por etapa y por responsable', async () => {
    const sales = await scenario.sales();
    const id = await scenario.opportunity(sales, { owner_id: sales.id });
    const detail = await scenario.opportunityDetail(sales, id);
    const query = `view=all&stage=${detail.stage}&owner_id=${sales.id}&party_id=${detail.party.id}`;
    const response = await scenario.get(`/v1/crm/opportunities?${query}`, sales.session);
    expect(response.status, response.text).toBe(200);
    const list = opportunityListResponseSchema.parse(response.body);
    expect(list.data.map((row) => row.id)).toEqual([id]);
  });
});

describe('decisión y envío de la cotización', () => {
  it('no aprueba con una versión vieja ni envía antes de tener el PDF', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales, { items: [item({ discount_percent: '20' })] });
    expect((await scenario.step(sales, id, 'submit')).status).toBe(204);
    const director = await scenario.director();
    const { version } = await scenario.quoteDetail(sales, id);
    const stale = scenario.action(`/v1/crm/quotes/${id}/actions/approve`, director, version - 1);
    expect(errorCode(await stale)).toBe('VERSION_CONFLICT');
    expect((await scenario.step(director, id, 'approve')).status).toBe(204);
    const send = await scenario.step(sales, id, 'send', {
      recipient_name: 'Clara Cliente',
      recipient_email: 'clara@example.com',
    });
    expect(errorCode(send)).toBe('CRM_QUOTE_PDF_NOT_READY');
  });
});

describe('periodo del informe del embudo', () => {
  it('acepta un periodo abierto por cualquiera de sus dos lados', async () => {
    const sales = await scenario.sales();
    await scenario.opportunity(sales, { owner_id: sales.id });
    for (const period of [`from=${scenario.day(-1)}`, `to=${scenario.day(1)}`]) {
      const query = `owner_id=${sales.id}&${period}`;
      const response = await scenario.get(`/v1/crm/reports/funnel?${query}`, sales.session);
      expect(response.status, response.text).toBe(200);
      expect(funnelReportSchema.parse(response.body).totals.open_count).toBe(1);
    }
  });
});
