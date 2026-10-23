import { opportunityListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { CrmScenario } from './support/crm-scenario.js';

// Embudo de oportunidades (B22, ficha 17.6): etapas con su probabilidad, perder exige el motivo,
// ganar deja al tercero como cliente y lo cerrado ya no cambia.

const scenario = new CrmScenario('crm oportunidades');

describe('etapas del embudo', () => {
  it('nace en prospección con la probabilidad de la etapa y avanza o retrocede', async () => {
    const sales = await scenario.sales();
    const id = await scenario.opportunity(sales);
    const created = await scenario.opportunityDetail(sales, id);
    expect(created).toMatchObject({ stage: 'prospecting', probability: 10 });
    expect(created.code).toMatch(/^OPO-\d{4}-\d{4}$/u);
    const path = `/v1/crm/opportunities/${id}/actions/move`;
    const firstMove = await scenario.action(path, sales, created.version, { stage: 'proposal' });
    expect(firstMove.status, firstMove.text).toBe(204);
    const moved = await scenario.opportunityDetail(sales, id);
    expect(moved).toMatchObject({
      stage: 'proposal',
      probability: 50,
      weighted_value: '12500000.00',
    });
    const back = { stage: 'diagnosis', probability: 30 };
    expect((await scenario.action(path, sales, moved.version, back)).status).toBe(204);
    expect(await scenario.opportunityDetail(sales, id)).toMatchObject(back);
  });
});

describe('etapas del embudo', () => {
  it('el tablero muestra las abiertas por fecha de cierre', async () => {
    const sales = await scenario.sales();
    const party = await scenario.party(sales);
    const later = await scenario.opportunity(sales, {
      party_id: party,
      expected_close: '2027-03-01',
    });
    const sooner = await scenario.opportunity(sales, {
      party_id: party,
      expected_close: '2026-11-01',
    });
    const response = await scenario.get(
      `/v1/crm/opportunities?view=open&party_id=${party}`,
      sales.session,
    );
    const ids = opportunityListResponseSchema.parse(response.body).data.map((row) => row.id);
    expect(ids).toEqual([sooner, later]);
  });
});

describe('perder y ganar', () => {
  it('perder exige un motivo de la lista', async () => {
    const sales = await scenario.sales();
    const id = await scenario.opportunity(sales);
    const opportunity = await scenario.opportunityDetail(sales, id);
    const path = `/v1/crm/opportunities/${id}/actions/lose`;
    expect((await scenario.action(path, sales, opportunity.version, {})).status).toBe(422);
    const bad = await scenario.action(path, sales, opportunity.version, { reason: 'NADA' });
    expect(errorCode(bad)).toBe('CRM_CATALOG_VALUE_INVALID');
    const body = { reason: 'PRICE', note: 'Eligió una propuesta más económica.' };
    expect((await scenario.action(path, sales, opportunity.version, body)).status).toBe(204);
    expect(await scenario.opportunityDetail(sales, id)).toMatchObject({
      stage: 'lost',
      probability: 0,
      lost_reason: { code: 'PRICE', label: 'Precio' },
      lost_note: body.note,
    });
  });
});

describe('perder y ganar', () => {
  it('ganar deja al tercero activo y como cliente', async () => {
    const sales = await scenario.sales();
    const lead = await scenario.qualifiedLead(sales);
    const person = await scenario.detail(sales, lead.person.id);
    const id = await scenario.opportunity(sales, { party_id: person.id });
    const opportunity = await scenario.opportunityDetail(sales, id);
    const win = `/v1/crm/opportunities/${id}/actions/win`;
    expect(errorCode(await scenario.action(win, sales, opportunity.version))).toBe(
      'CRM_DOCUMENT_REQUIRED',
    );
    const withDocument = {
      kind: 'person',
      first_name: person.first_name,
      last_name: person.last_name,
      id_type: 'CC',
      id_number: `7${String(Date.now()).slice(-9)}`,
    };
    const updated = await scenario.patch(
      `/v1/parties/${person.id}`,
      sales.session,
      withDocument,
      person.version,
    );
    expect(updated.status, updated.text).toBe(204);
    expect((await scenario.action(win, sales, opportunity.version)).status).toBe(204);
    expect(await scenario.detail(sales, person.id)).toMatchObject({
      status: 'active',
      roles: ['customer'],
    });
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'crm.opportunity.create:success',
      'crm.opportunity.win:success',
    ]);
  });
});

describe('lo cerrado no cambia', () => {
  it('ni por la API ni directamente en la base', async () => {
    const sales = await scenario.sales();
    const id = await scenario.opportunity(sales);
    const opportunity = await scenario.opportunityDetail(sales, id);
    await scenario.action(`/v1/crm/opportunities/${id}/actions/lose`, sales, opportunity.version, {
      reason: 'NO_BUDGET',
    });
    const lost = await scenario.opportunityDetail(sales, id);
    const move = await scenario.action(
      `/v1/crm/opportunities/${id}/actions/move`,
      sales,
      lost.version,
      {
        stage: 'proposal',
      },
    );
    expect(errorCode(move)).toBe('CRM_STATUS_INVALID');
    const inTenant = tenantScope(scenario.db, scenario.tenant.id);
    await expect(
      inTenant((tx) => tx.crmOpportunity.update({ where: { id }, data: { title: 'Otro título' } })),
    ).rejects.toThrow(/no cambia/u);
    await expect(
      inTenant((tx) =>
        tx.crmOpportunity.update({ where: { id }, data: { stage: 'lost', lostReason: null } }),
      ),
    ).rejects.toThrow();
  });
});

describe('lo cerrado no cambia', () => {
  it('un cliente bloqueado o inexistente no recibe oportunidades', async () => {
    const sales = await scenario.sales();
    const response = await scenario.post('/v1/crm/opportunities', sales.session, {
      party_id: '019a0000-0000-7000-8000-000000000099',
      title: 'Sin cliente',
      estimated_value: '1.00',
      expected_close: '2026-12-01',
    });
    expect(errorCode(response)).toBe('CRM_PARTY_INVALID');
  });
});
