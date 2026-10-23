import { crmActivityListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { sendActivityReminders } from '../../../src/modules/crm/index.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { CrmScenario } from './support/crm-scenario.js';

// Más casos límite del CRM (B22): comentarios cortos desde Mis tareas, edición sin cambiar el
// origen, descarte con detalle, páginas de actividades y el recordatorio de una oportunidad.

const scenario = new CrmScenario('crm mas limites');

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe('descartes y edición', () => {
  it('descartar desde la tarea con un comentario muy corto no guarda nota', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const [task] = (await scenario.contactTasks(id)).tasks;
    const path = `/v1/tasks/${task?.id ?? ''}/actions/complete`;
    const response = await scenario.post(path, sales.session, { action: 'discard', comment: 'No' });
    expect(response.status, response.text).toBe(204);
    expect(await scenario.leadDetail(sales, id)).toMatchObject({
      status: 'discarded',
      discard_note: null,
    });
  });
});

describe('descartes y edición', () => {
  it('se edita sin cambiar el origen y un nuevo se descarta con su detalle', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const lead = await scenario.leadDetail(sales, id);
    const body = { need: 'Ahora también quiere capacitación.', source: lead.source.code };
    const edited = await scenario.patch(`/v1/crm/leads/${id}`, sales.session, body, lead.version);
    expect(edited.status, edited.text).toBe(204);
    const after = await scenario.leadDetail(sales, id);
    const note = 'Pidió no volver a llamarlo.';
    const path = `/v1/crm/leads/${id}/actions/discard`;
    const discard = await scenario.action(path, sales, after.version, { reason: 'OTHER', note });
    expect(discard.status, discard.text).toBe(204);
    const { instance } = await scenario.contactTasks(id);
    expect(instance?.currentState).toBe('discarded');
  });
});

describe('actividades por páginas y recordatorio de una oportunidad', () => {
  it('la lista de un prospecto pagina', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    for (const subject of ['Primera llamada', 'Segunda llamada']) {
      await scenario.create('/v1/crm/activities', sales, {
        lead_id: leadId,
        type: 'call',
        subject,
        due_at: minutesFromNow(600),
      });
    }
    const first = crmActivityListResponseSchema.parse(
      (await scenario.get(`/v1/crm/activities?lead_id=${leadId}&limit=1`, sales.session)).body,
    );
    expect(first.next_cursor).not.toBeNull();
    const next = `/v1/crm/activities?lead_id=${leadId}&limit=1&cursor=${first.next_cursor ?? ''}`;
    const second = crmActivityListResponseSchema.parse(
      (await scenario.get(next, sales.session)).body,
    );
    expect(second.data.map((row) => row.subject)).toEqual(['Segunda llamada']);
  });
});

describe('actividades por páginas y recordatorio de una oportunidad', () => {
  it('el recordatorio de una actividad de oportunidad lleva el código de la oportunidad', async () => {
    const sales = await scenario.sales();
    const opportunityId = await scenario.opportunity(sales);
    const opportunity = await scenario.opportunityDetail(sales, opportunityId);
    const id = await scenario.create('/v1/crm/activities', sales, {
      opportunity_id: opportunityId,
      type: 'meeting',
      subject: 'Reunión de cierre',
      due_at: minutesFromNow(15),
    });
    await sendActivityReminders({ database: apiDatabase(), clock: { now: () => new Date() } });
    const events = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.outboxEvent.findMany({ where: { eventType: 'crm.activity.reminder' } }));
    const mine = events.find((event) => (event.payload as { id: string }).id === id);
    expect(mine?.payload).toMatchObject({ record_code: opportunity.code });
  });
});
