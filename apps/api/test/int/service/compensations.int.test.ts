import { compensationListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { ServiceScenario } from './support/service-scenario.js';

const scenario = new ServiceScenario('mesa de ayuda: compensaciones');

async function compensations(person: Person, ticketId: string) {
  const response = await scenario.get(`/v1/tickets/${ticketId}/compensations`, person.session);
  expect(response.status, response.text).toBe(200);
  return compensationListResponseSchema.parse(response.body).data;
}

describe('compensaciones (RE-SAC-001)', () => {
  it('otra persona la decide; quien la propuso no puede', async () => {
    const agent = await scenario.agent();
    const approver = await scenario.agent();
    const id = await scenario.working(agent);
    const base = `/v1/tickets/${id}/compensations`;
    const mixed = await scenario.post(base, agent.session, {
      type: 'discount',
      hours: 2,
      reason: 'Se superó el plazo.',
    });
    expect(mixed.status).toBe(422);
    const compensationId = await scenario.create(base, agent, {
      type: 'discount',
      amount: '150000.50',
      reason: 'Se superó el plazo de solución.',
    });
    const [proposed] = await compensations(agent, id);
    expect(proposed).toMatchObject({ status: 'proposed', amount: '150000.50' });
    const decide = `${base}/${compensationId}/actions/decide`;
    const own = await scenario.action(decide, agent, proposed?.version ?? 0, { approve: true });
    expect(own.status).toBe(422);
    const ok = await scenario.action(decide, approver, proposed?.version ?? 0, { approve: true });
    expect(ok.status, ok.text).toBe(204);
    const [approved] = await compensations(agent, id);
    expect(approved).toMatchObject({ status: 'approved', decided_by: { id: approver.id } });
    await scenario.dispatchNotices();
    expect((await scenario.noticesFor(agent.id, 'svc_ticket_update')).join(' ')).toContain(
      'aprobaron',
    );
    expect(await scenario.auditActions(compensationId)).toEqual([
      'service.compensation.propose',
      'service.compensation.approve',
    ]);
  });
});

it('permite rechazar una compensación e impide decidirla de nuevo', async () => {
  const agent = await scenario.agent();
  const approver = await scenario.agent();
  const id = await scenario.working(agent);
  const base = `/v1/tickets/${id}/compensations`;
  const compensationId = await scenario.create(base, agent, {
    type: 'discount',
    amount: '150000.50',
    reason: 'Se superó el plazo de solución.',
  });
  const proposed = (await compensations(agent, id)).find((row) => row.id === compensationId);
  if (proposed === undefined) throw new Error('No aparece la compensación propuesta');
  const path = `${base}/${compensationId}/actions/decide`;
  const body = { approve: false, note: 'No corresponde al acuerdo de servicio.' };
  expect((await scenario.action(path, approver, proposed.version + 1, body)).status).toBe(409);
  const rejected = await scenario.action(path, approver, proposed.version, body);
  expect(rejected.status, rejected.text).toBe(204);
  expect((await compensations(agent, id))[0]).toMatchObject({ status: 'rejected' });
  expect((await scenario.action(path, approver, proposed.version + 1, body)).status).toBe(409);
});

it('registra la aplicación únicamente para una compensación aprobada y con fecha válida', async () => {
  const agent = await scenario.agent();
  const approver = await scenario.agent();
  const id = await scenario.working(agent);
  const base = `/v1/tickets/${id}/compensations`;
  const compensationId = await scenario.create(base, agent, {
    type: 'discount',
    amount: '150000.50',
    reason: 'Se superó el plazo de solución.',
  });
  const [proposed] = await compensations(agent, id);
  if (proposed === undefined) throw new Error('No aparece la compensación propuesta');
  const path = `${base}/${compensationId}/actions`;
  const today = bogotaToday(scenario.clock.now());
  const body = { applied_on: today };
  expect((await scenario.action(`${path}/apply`, approver, proposed.version, body)).status).toBe(
    409,
  );
  const approved = await scenario.action(`${path}/decide`, approver, proposed.version, {
    approve: true,
  });
  expect(approved.status, approved.text).toBe(204);
  const future = { applied_on: addDays(today, 1) };
  expect(
    (await scenario.action(`${path}/apply`, approver, proposed.version + 1, future)).status,
  ).toBe(422);
  expect((await scenario.action(`${path}/apply`, approver, proposed.version, body)).status).toBe(
    409,
  );
  const applied = await scenario.action(`${path}/apply`, approver, proposed.version + 1, body);
  expect(applied.status, applied.text).toBe(204);
  expect((await compensations(agent, id))[0]).toMatchObject({
    status: 'applied',
    applied_on: today,
  });
});
