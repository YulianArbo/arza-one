import { campaignListResponseSchema, funnelReportSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { CrmScenario } from './support/crm-scenario.js';

// Informe del embudo RE-COM-001 y campañas (B22). El informe cuenta lo de un responsable en el
// periodo; los totales se revisan contra el cálculo a mano.

const scenario = new CrmScenario('crm informe');

/** Una abierta en propuesta (2.500.000,55 al 50 %) y una perdida por precio (1.000.000). */
async function funnelSample(sales: Person): Promise<string> {
  const a = await scenario.opportunity(sales, { estimated_value: '1000000.00' });
  const b = await scenario.opportunity(sales, { estimated_value: '2500000.55' });
  const detailB = await scenario.opportunityDetail(sales, b);
  await scenario.action(`/v1/crm/opportunities/${b}/actions/move`, sales, detailB.version, {
    stage: 'proposal',
  });
  const detailA = await scenario.opportunityDetail(sales, a);
  await scenario.action(`/v1/crm/opportunities/${a}/actions/lose`, sales, detailA.version, {
    reason: 'PRICE',
  });
  return detailB.code;
}

describe('informe del embudo', () => {
  it('coincide con el cálculo a mano y se descarga en CSV con auditoría', async () => {
    const sales = await scenario.sales();
    const openCode = await funnelSample(sales);
    const query = `owner_id=${sales.id}`;
    const response = await scenario.get(`/v1/crm/reports/funnel?${query}`, sales.session);
    const report = funnelReportSchema.parse(response.body);
    expect(report.totals).toMatchObject({
      open_count: 1,
      open_value: '2500000.55',
      weighted_value: '1250000.28',
      lost_count: 1,
      lost_value: '1000000.00',
      win_rate: 0,
    });
    expect(report.lost_reasons).toEqual([
      { code: 'PRICE', label: 'Precio', count: 1, value: '1000000.00' },
    ]);
    const csv = await scenario.post('/v1/crm/reports/funnel/export', sales.session, {
      owner_id: sales.id,
    });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(openCode);
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.auditEvent.findMany({ where: { action: 'crm.report.export', actorId: sales.id } }),
    );
    expect(events).toHaveLength(1);
  });
});

describe('informe del embudo', () => {
  it('una fecha final anterior a la inicial no es válida', async () => {
    const sales = await scenario.sales();
    const response = await scenario.get(
      '/v1/crm/reports/funnel?from=2026-10-10&to=2026-10-01',
      sales.session,
    );
    expect(response.status).toBe(422);
  });
});

describe('campañas', () => {
  it('se crean, se editan, no repiten nombre y cuentan sus prospectos', async () => {
    const sales = await scenario.sales();
    const name = `Feria tecnológica ${String(Date.now())}`;
    const body = { name, channel: 'event', starts_on: '2026-10-01', budget: '1500000.00' };
    const id = await scenario.create('/v1/crm/campaigns', sales, body);
    expect(errorCode(await scenario.post('/v1/crm/campaigns', sales.session, body))).toBe(
      'CRM_CAMPAIGN_DUPLICATE',
    );
    await scenario.lead(sales, { campaign_id: id, source: 'EVENT' });
    const list = campaignListResponseSchema.parse(
      (await scenario.get('/v1/crm/campaigns', sales.session)).body,
    );
    const campaign = list.data.find((row) => row.id === id);
    expect(campaign).toMatchObject({ leads_count: 1, budget: '1500000.00' });
    const edited = await scenario.put(
      `/v1/crm/campaigns/${id}`,
      sales,
      { ...body, ends_on: '2026-10-03' },
      campaign?.version ?? 0,
    );
    expect(edited.status, edited.text).toBe(204);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'crm.campaign.create:success',
      'crm.campaign.update:success',
    ]);
  });
});
