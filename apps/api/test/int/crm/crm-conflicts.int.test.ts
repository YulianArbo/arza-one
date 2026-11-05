import { campaignListResponseSchema, opportunityListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { QuoteScenario } from './support/quote-scenario.js';

// Ediciones sobre versiones viejas y registros que no existen en el CRM (B22 y B23): la persona ve
// que alguien cambió el registro y debe recargarlo, en lugar de pisar el cambio del otro.

const scenario = new QuoteScenario('crm conflictos de version');

const MISSING = '0190a000-0000-7000-8000-000000000001';

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe('actividades', () => {
  it('no se edita una actividad que no existe ni sobre una versión vieja', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const body = { type: 'call', subject: 'Llamar al cliente', due_at: minutesFromNow(120) };
    const id = await scenario.create('/v1/crm/activities', sales, { lead_id: leadId, ...body });
    const missing = scenario.patch(`/v1/crm/activities/${MISSING}`, sales.session, body, 1);
    expect(errorCode(await missing)).toBe('CRM_NOT_FOUND');
    const stale = scenario.patch(`/v1/crm/activities/${id}`, sales.session, body, 9);
    expect(errorCode(await stale)).toBe('VERSION_CONFLICT');
  });
});

describe('campañas', () => {
  it('una campaña nueva cuenta cero prospectos y no se edita sobre una versión vieja', async () => {
    const sales = await scenario.sales();
    const body = {
      name: `Seminario ${String(Date.now())}`,
      channel: 'event',
      starts_on: '2026-10-01',
      budget: '500000.00',
    };
    const id = await scenario.create('/v1/crm/campaigns', sales, body);
    const list = campaignListResponseSchema.parse(
      (await scenario.get('/v1/crm/campaigns', sales.session)).body,
    );
    expect(list.data.find((row) => row.id === id)?.leads_count).toBe(0);
    const stale = await scenario.put(`/v1/crm/campaigns/${id}`, sales, body, 9);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
  });
});

describe('oportunidades', () => {
  it('pasan de página y no se editan sobre una versión vieja', async () => {
    const sales = await scenario.sales();
    const id = await scenario.opportunity(sales, { owner_id: sales.id });
    await scenario.opportunity(sales, { owner_id: sales.id });
    const query = `owner_id=${sales.id}&limit=1`;
    const first = opportunityListResponseSchema.parse(
      (await scenario.get(`/v1/crm/opportunities?${query}`, sales.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const second = opportunityListResponseSchema.parse(
      (
        await scenario.get(
          `/v1/crm/opportunities?${query}&cursor=${first.next_cursor ?? ''}`,
          sales.session,
        )
      ).body,
    );
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
    const body = {
      title: 'Portal de clientes, segunda fase',
      estimated_value: '30000000.00',
      expected_close: '2026-12-20',
      owner_id: sales.id,
      probability: 40,
    };
    const stale = scenario.patch(`/v1/crm/opportunities/${id}`, sales.session, body, 9);
    expect(errorCode(await stale)).toBe('VERSION_CONFLICT');
  });
});

describe('cotizaciones', () => {
  it('el borrador no se guarda sobre una versión vieja', async () => {
    const sales = await scenario.sales();
    const id = await scenario.quote(sales);
    const stale = await scenario.put(`/v1/crm/quotes/${id}`, sales, scenario.draft(), 9);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
  });

  it('de una rechazada sale una sola versión nueva, y con la versión vigente', async () => {
    const sales = await scenario.sales();
    const { id, token } = await scenario.sent(sales);
    const reason = 'El presupuesto no alcanza.';
    expect((await scenario.public('reject', { token, reason })).status).toBe(204);
    const { version } = await scenario.quoteDetail(sales, id);
    const path = `/v1/crm/quotes/${id}/actions/new-version`;
    expect(errorCode(await scenario.action(path, sales, version + 1))).toBe('VERSION_CONFLICT');
    expect((await scenario.action(path, sales, version)).status).toBe(201);
    expect(errorCode(await scenario.action(path, sales, version))).toBe('CRM_STATUS_INVALID');
  });
});
