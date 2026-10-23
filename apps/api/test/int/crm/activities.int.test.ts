import { crmActivityListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { sendActivityReminders } from '../../../src/modules/crm/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { CrmScenario } from './support/crm-scenario.js';

// Actividades y recordatorios (B22, ficha 17.6): se agendan en un prospecto o una oportunidad
// abiertos, se marcan hechas con su resultado y su responsable recibe un aviso 30 minutos antes.

const scenario = new CrmScenario('crm actividades');

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function activity(person: Person, body: object): Promise<string> {
  return scenario.create('/v1/crm/activities', person, {
    type: 'call',
    subject: 'Llamar para entender la necesidad',
    due_at: minutesFromNow(120),
    ...body,
  });
}

describe('agenda', () => {
  it('se agenda, aparece en la agenda propia y se marca hecha con su resultado', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const id = await activity(sales, { lead_id: leadId });
    const mine = await scenario.get('/v1/crm/activities?mine=true', sales.session);
    const [row] = crmActivityListResponseSchema.parse(mine.body).data;
    expect(row).toMatchObject({
      id,
      record: { kind: 'lead', id: leadId },
      assignee: { id: sales.id },
    });
    const path = `/v1/crm/activities/${id}/actions/complete`;
    expect((await scenario.action(path, sales, row?.version ?? 0, {})).status).toBe(422);
    const outcome = { outcome: 'Quiere una propuesta para diciembre.' };
    expect((await scenario.action(path, sales, row?.version ?? 0, outcome)).status).toBe(204);
    const done = await scenario.get(
      `/v1/crm/activities?lead_id=${leadId}&view=done`,
      sales.session,
    );
    expect(crmActivityListResponseSchema.parse(done.body).data).toMatchObject([outcome]);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'crm.activity.create:success',
      'crm.activity.complete:success',
    ]);
  });
});

describe('agenda', () => {
  it('no se agenda en una oportunidad cerrada ni en dos registros a la vez', async () => {
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const opportunity = await scenario.opportunityDetail(sales, opportunityId);
    await scenario.action(
      `/v1/crm/opportunities/${opportunityId}/actions/lose`,
      sales,
      opportunity.version,
      {
        reason: 'OTHER',
      },
    );
    const closed = await scenario.post('/v1/crm/activities', sales.session, {
      opportunity_id: opportunityId,
      type: 'task',
      subject: 'Seguimiento',
      due_at: minutesFromNow(60),
    });
    expect(errorCode(closed)).toBe('CRM_STATUS_INVALID');
    const leadId = await scenario.lead(sales);
    const both = await scenario.post('/v1/crm/activities', sales.session, {
      lead_id: leadId,
      opportunity_id: opportunityId,
      type: 'task',
      subject: 'Doble',
      due_at: minutesFromNow(60),
    });
    expect(both.status).toBe(422);
  });
});

describe('recordatorios', () => {
  it('avisa una sola vez la actividad que empieza en los próximos 30 minutos', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const soon = await activity(sales, { lead_id: leadId, due_at: minutesFromNow(20) });
    const later = await activity(sales, { lead_id: leadId, due_at: minutesFromNow(90) });
    const deps = { database: apiDatabase(), clock: { now: () => new Date() } };
    expect(await sendActivityReminders(deps)).toBeGreaterThanOrEqual(1);
    await sendActivityReminders(deps);
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.outboxEvent.findMany({ where: { eventType: 'crm.activity.reminder' } }));
    const reminded = events.map((event) => (event.payload as { id: string }).id);
    expect(reminded.filter((id) => id === soon)).toHaveLength(1);
    expect(reminded).not.toContain(later);
  });
});

describe('recordatorios', () => {
  it('cambiar la hora vuelve a programar el recordatorio', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const id = await activity(sales, { lead_id: leadId, due_at: minutesFromNow(10) });
    await sendActivityReminders({ database: apiDatabase(), clock: { now: () => new Date() } });
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    const before = await inTenant((tx) => tx.crmActivity.findUniqueOrThrow({ where: { id } }));
    expect(before.remindedAt).not.toBeNull();
    const response = await scenario.patch(
      `/v1/crm/activities/${id}`,
      sales.session,
      { type: 'meeting', subject: before.subject, due_at: minutesFromNow(240) },
      before.version,
    );
    expect(response.status, response.text).toBe(204);
    const after = await inTenant((tx) => tx.crmActivity.findUniqueOrThrow({ where: { id } }));
    expect(after.remindedAt).toBeNull();
  });
});
