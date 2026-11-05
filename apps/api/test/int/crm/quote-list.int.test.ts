import { quoteListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { QuoteScenario, item } from './support/quote-scenario.js';

// Listado de cotizaciones (B23): filtros por estado y oportunidad, páginas y versiones, el PDF antes
// de estar listo y las líneas que vienen del portafolio de servicios.

const scenario = new QuoteScenario('crm listado de cotizaciones');

async function list(person: Person, query: string) {
  const response = await scenario.get(`/v1/crm/quotes?${query}`, person.session);
  expect(response.status, response.text).toBe(200);
  return quoteListResponseSchema.parse(response.body);
}

describe('listado de cotizaciones', () => {
  it('filtra por estado y por oportunidad, y pasa de página', async () => {
    const sales = await scenario.sales();
    const first = await scenario.quote(sales);
    const second = await scenario.quote(sales);
    await scenario.step(sales, second, 'submit');
    const drafts = await list(sales, 'status=draft&view=all');
    expect(drafts.data.map((row) => row.id)).toContain(first);
    expect(drafts.data.map((row) => row.id)).not.toContain(second);
    const detail = await scenario.quoteDetail(sales, first);
    const byOpportunity = await list(sales, `opportunity_id=${detail.opportunity.id}`);
    expect(byOpportunity.data.map((row) => row.id)).toEqual([first]);
    const page = await list(sales, 'limit=1');
    expect(page.data).toHaveLength(1);
    expect(page.next_cursor).not.toBeNull();
    const next = await list(sales, `limit=1&cursor=${page.next_cursor ?? ''}`);
    expect(next.data[0]?.id).not.toBe(page.data[0]?.id);
  });

  it('busca por el código de la cotización', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales);
    const { code } = await scenario.quoteDetail(sales, id);
    const found = await list(sales, `q=${encodeURIComponent(code)}&view=all`);
    expect(found.data.map((row) => row.id)).toEqual([id]);
  });
});

describe('parámetros tributarios', () => {
  it('el historial de un impuesto que no existe no se encuentra', async () => {
    const accountant = await scenario.person('contador-impuestos', ['CONTADOR']);
    const response = await scenario.get(
      '/v1/finance/tax-parameters/NO_EXISTE/history',
      accountant.session,
    );
    expect(response.status).toBe(404);
  });
});

describe('detalle de la cotización', () => {
  it('el PDF no se descarga antes de que el worker lo prepare', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales);
    await scenario.step(sales, id, 'submit');
    expect(errorCode(await scenario.post(`/v1/crm/quotes/${id}/pdf`, sales.session))).toBe(
      'CRM_QUOTE_PDF_NOT_READY',
    );
  });

  it('una línea del portafolio muestra el código del servicio', async () => {
    const sales = await scenario.sales();
    const serviceId = await scenario.create('/v1/crm/services', sales, {
      name: `Soporte mensual ${String(Date.now())}`,
      description: 'Mesa de ayuda y mantenimiento.',
      unit: 'month',
      base_price: '1200000',
      tax_key: 'IVA_GENERAL',
    });
    const id = await scenario.quote(sales, { items: [item({ service_id: serviceId })] });
    const [line] = (await scenario.quoteDetail(sales, id)).items;
    expect(line?.service).toEqual({
      id: serviceId,
      code: expect.stringMatching(/^SRV-/u) as string,
    });
  });
});
