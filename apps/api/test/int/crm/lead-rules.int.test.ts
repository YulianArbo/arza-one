import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { CrmScenario } from './support/crm-scenario.js';

// Reglas del prospecto (B22): el orden de los estados, la tarea atendida desde Mis tareas y lo que
// la base de datos impide aunque alguien lo intente directamente en ella.

const scenario = new CrmScenario('crm reglas prospectos');

describe('orden de los estados', () => {
  it('no se convierte sin calificar, ni se cambia uno cerrado', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const lead = await scenario.leadDetail(sales, id);
    const convert = await scenario.action(
      `/v1/crm/leads/${id}/actions/convert`,
      sales,
      lead.version,
      {
        party_id: lead.person.id,
        title: 'Sin calificar',
        estimated_value: '100.00',
        expected_close: '2026-12-01',
      },
    );
    expect(errorCode(convert)).toBe('CRM_STATUS_INVALID');
    const discard = { reason: 'DUPLICATE', note: null };
    await scenario.action(`/v1/crm/leads/${id}/actions/discard`, sales, lead.version, discard);
    const closed = await scenario.leadDetail(sales, id);
    const again = await scenario.action(
      `/v1/crm/leads/${id}/actions/qualify`,
      sales,
      closed.version,
    );
    expect(errorCode(again)).toBe('CRM_STATUS_INVALID');
  });
});

describe('orden de los estados', () => {
  it('con una versión vieja responde 409', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const lead = await scenario.leadDetail(sales, id);
    const stale = await scenario.action(
      `/v1/crm/leads/${id}/actions/qualify`,
      sales,
      lead.version - 1,
    );
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
  });
});

describe('la tarea de contacto desde Mis tareas', () => {
  it('calificar desde la tarea califica el prospecto', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const [task] = (await scenario.contactTasks(id)).tasks;
    const response = await scenario.post(
      `/v1/tasks/${task?.id ?? ''}/actions/complete`,
      sales.session,
      {
        action: 'qualify',
      },
    );
    expect(response.status, response.text).toBe(204);
    expect((await scenario.leadDetail(sales, id)).status).toBe('qualified');
  });
});

describe('la tarea de contacto desde Mis tareas', () => {
  it('descartar desde la tarea lo descarta con el motivo «Otro» y el comentario', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const [task] = (await scenario.contactTasks(id)).tasks;
    const comment = 'No contestó en tres intentos.';
    const response = await scenario.post(
      `/v1/tasks/${task?.id ?? ''}/actions/complete`,
      sales.session,
      {
        action: 'discard',
        comment,
      },
    );
    expect(response.status, response.text).toBe(204);
    const lead = await scenario.leadDetail(sales, id);
    expect(lead).toMatchObject({ status: 'discarded', discard_note: comment });
    expect(lead.discard_reason?.code).toBe('OTHER');
  });
});

describe('lo que impide la base de datos', () => {
  it('un prospecto cerrado no cambia y uno descartado lleva su motivo', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    await expect(
      inTenant((tx) =>
        tx.crmLead.update({ where: { id }, data: { status: 'discarded', closedAt: new Date() } }),
      ),
    ).rejects.toThrow(/crm_leads_discard_check/u);
    const lead = await scenario.leadDetail(sales, id);
    await scenario.action(`/v1/crm/leads/${id}/actions/discard`, sales, lead.version, {
      reason: 'FALSE_DATA',
    });
    await expect(
      inTenant((tx) => tx.crmLead.update({ where: { id }, data: { need: 'Otra cosa distinta' } })),
    ).rejects.toThrow(/no cambia/u);
  });
});
