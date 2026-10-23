import {
  crmActivityListResponseSchema,
  funnelReportSchema,
  leadListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { sendActivityReminders } from '../../../src/modules/crm/index.js';
import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { CrmScenario } from './support/crm-scenario.js';

// Casos límite del CRM (B22): responsables y campañas que no existen, filtros de las listas,
// edición del prospecto, descarte de uno calificado, actividades de oportunidades, recordatorios
// vencidos e informe por periodo.

const scenario = new CrmScenario('crm limites');
const MISSING = uuidv7();

async function campaign(person: Parameters<CrmScenario['lead']>[0]): Promise<string> {
  return scenario.create('/v1/crm/campaigns', person, {
    name: `Campaña ${uuidv7()}`,
    channel: 'social',
    starts_on: '2026-10-01',
  });
}

describe('datos que no existen', () => {
  it('un responsable o una campaña inexistentes responden 422', async () => {
    const sales = await scenario.sales();
    const owner = await scenario.post(
      '/v1/crm/leads',
      sales.session,
      await scenario.leadBody({ owner_id: MISSING }),
    );
    expect(errorCode(owner)).toBe('CRM_OWNER_INVALID');
    const unknown = await scenario.post(
      '/v1/crm/leads',
      sales.session,
      await scenario.leadBody({ campaign_id: MISSING }),
    );
    expect(errorCode(unknown)).toBe('CRM_CAMPAIGN_INVALID');
    const edit = await scenario.put(
      `/v1/crm/campaigns/${MISSING}`,
      sales,
      {
        name: 'Nada',
        channel: 'email',
        starts_on: '2026-10-01',
      },
      1,
    );
    expect(errorCode(edit)).toBe('CRM_NOT_FOUND');
  });
});

describe('edición y filtros de los prospectos', () => {
  it('cambia origen y campaña, y la lista filtra por campaña y responsable', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const campaignId = await campaign(sales);
    const lead = await scenario.leadDetail(sales, id);
    const body = {
      need: 'Ahora necesita también soporte.',
      source: 'EVENT',
      campaign_id: campaignId,
    };
    const response = await scenario.patch(`/v1/crm/leads/${id}`, sales.session, body, lead.version);
    expect(response.status, response.text).toBe(204);
    const edited = await scenario.leadDetail(sales, id);
    expect(edited).toMatchObject({ source: { code: 'EVENT' }, campaign: { id: campaignId } });
    const list = await scenario.get(
      `/v1/crm/leads?campaign_id=${campaignId}&owner_id=${sales.id}&limit=1`,
      sales.session,
    );
    expect(leadListResponseSchema.parse(list.body).data.map((row) => row.id)).toEqual([id]);
    const bad = await scenario.patch(
      `/v1/crm/leads/${id}`,
      sales.session,
      { ...body, source: 'NO' },
      edited.version,
    );
    expect(errorCode(bad)).toBe('CRM_CATALOG_VALUE_INVALID');
  });
});

describe('edición y filtros de los prospectos', () => {
  it('la lista pagina y un calificado se descarta sin tarea abierta', async () => {
    const sales = await scenario.sales();
    await scenario.lead(sales);
    await scenario.lead(sales);
    const first = leadListResponseSchema.parse(
      (await scenario.get(`/v1/crm/leads?owner_id=${sales.id}&limit=1`, sales.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const second = await scenario.get(
      `/v1/crm/leads?owner_id=${sales.id}&limit=1&cursor=${first.next_cursor ?? ''}`,
      sales.session,
    );
    expect(leadListResponseSchema.parse(second.body).data).toHaveLength(1);
    const lead = await scenario.qualifiedLead(sales);
    const discard = await scenario.action(
      `/v1/crm/leads/${lead.id}/actions/discard`,
      sales,
      lead.version,
      {
        reason: 'NOT_TARGET',
        note: 'Ya no tiene presupuesto este año.',
      },
    );
    expect(discard.status, discard.text).toBe(204);
  });
});

describe('actividades de una oportunidad', () => {
  it('se listan por oportunidad, se editan con la misma hora y una hecha no cambia', async () => {
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const id = await scenario.create('/v1/crm/activities', sales, {
      opportunity_id: opportunityId,
      type: 'meeting',
      subject: 'Reunión de diagnóstico',
      due_at: '2026-12-01T15:00:00Z',
    });
    const path = `/v1/crm/activities?opportunity_id=${opportunityId}&view=all`;
    const [row] = crmActivityListResponseSchema.parse(
      (await scenario.get(path, sales.session)).body,
    ).data;
    expect(row?.record).toMatchObject({ kind: 'opportunity', id: opportunityId });
    const same = {
      type: 'meeting',
      subject: 'Reunión con la gerencia',
      due_at: '2026-12-01T15:00:00Z',
    };
    expect((await scenario.patch(`/v1/crm/activities/${id}`, sales.session, same, 1)).status).toBe(
      204,
    );
    await scenario.action(`/v1/crm/activities/${id}/actions/complete`, sales, 2, {
      outcome: 'Hecha.',
    });
    const again = await scenario.patch(`/v1/crm/activities/${id}`, sales.session, same, 3);
    expect(errorCode(again)).toBe('CRM_STATUS_INVALID');
    const done = await scenario.get(
      `/v1/crm/activities?opportunity_id=${opportunityId}&view=done`,
      sales.session,
    );
    expect(crmActivityListResponseSchema.parse(done.body).data).toHaveLength(1);
  });
});

describe('actividades de una oportunidad', () => {
  it('quien solo lee no agenda en una oportunidad', async () => {
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const director = await scenario.person('direccion-actividad', ['DIRECCION']);
    const response = await scenario.post('/v1/crm/activities', director.session, {
      opportunity_id: opportunityId,
      type: 'task',
      subject: 'Seguimiento',
      due_at: '2026-12-01T15:00:00Z',
    });
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });
});

describe('recordatorios vencidos e informe por periodo', () => {
  it('una actividad de hace más de un día se marca sin avisar', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const id = await scenario.create('/v1/crm/activities', sales, {
      lead_id: leadId,
      type: 'task',
      subject: 'Tarea olvidada',
      due_at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
    });
    await sendActivityReminders({ database: apiDatabase(), clock: { now: () => new Date() } });
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) =>
      tx.outboxEvent.findMany({
        where: { eventType: { in: ['crm.activity.missed', 'crm.activity.reminder'] } },
      }),
    );
    const mine = events.filter((event) => (event.payload as { id: string }).id === id);
    expect(mine.map((event) => event.eventType)).toEqual(['crm.activity.missed']);
  });
});

describe('recordatorios vencidos e informe por periodo', () => {
  it('el informe cuenta solo lo creado en el periodo', async () => {
    const sales = await scenario.sales();
    await scenario.opportunity(sales);
    const future = await scenario.get(
      `/v1/crm/reports/funnel?from=2030-01-01&to=2030-12-31&owner_id=${sales.id}`,
      sales.session,
    );
    expect(funnelReportSchema.parse(future.body).rows).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    const now = await scenario.get(
      `/v1/crm/reports/funnel?to=${today}&owner_id=${sales.id}`,
      sales.session,
    );
    expect(funnelReportSchema.parse(now.body).rows.length).toBeGreaterThan(0);
  });
});
