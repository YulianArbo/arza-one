import {
  committeeMinuteListResponseSchema,
  complaintListResponseSchema,
  mySstSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { addMember, at, fileComplaint, sstFixture, today } from './support/sst-fixture.js';

// Comités y canal confidencial de convivencia (B37, decisiones 8 y 9; ficha 17.14: «la información
// del Comité de Convivencia es restringida a sus integrantes»). Ni SST, ni la Dirección, ni Talento
// humano la ven si no integran el comité; los textos van cifrados y cada lectura queda registrada.

const scenario = new AccessScenario('sst comites');
const RECIPIENTS = z.object({ recipients: z.array(z.string()) });
const SUMMARY = 'Se revisó un caso de trato irrespetuoso y se citó a las partes.';

it('las actas de Convivencia solo las ven y registran sus integrantes', async () => {
  const f = await sstFixture(scenario, 'convivencia-actas');
  await addMember(scenario, f, 'coexistence', f.peer);
  const minute = { committee: 'coexistence', meeting_on: today(scenario), summary: SUMMARY };
  expect((await scenario.post('/v1/sst/committee-minutes', f.sst.session, minute)).status).toBe(
    403,
  );
  const recorded = await scenario.post('/v1/sst/committee-minutes', f.peer.session, minute);
  expect(recorded.status, recorded.text).toBe(201);
  const stored = await scenario.inTenant((tx) =>
    tx.sstCommitteeMinute.findFirstOrThrow({
      where: { committee: 'coexistence', recordedBy: f.peer.id },
    }),
  );
  expect(stored.summaryEncrypted).not.toContain('irrespetuoso');
  const query = { committee: 'coexistence' };
  for (const outsider of [f.sst, f.hr, f.boss]) {
    const denied = await scenario.post('/v1/sst/committee-minutes/read', outsider.session, query);
    expect(denied.status).toBe(403);
  }
  const read = committeeMinuteListResponseSchema.parse(
    (await scenario.post('/v1/sst/committee-minutes/read', f.peer.session, query)).body,
  );
  expect(read.data.map((entry) => entry.summary)).toContain(SUMMARY);
  const audited = await scenario.inTenant((tx) =>
    tx.auditEvent.count({ where: { entityId: stored.id, action: 'sst.committee.read_minute' } }),
  );
  expect(audited).toBe(1);
});

it('las actas del COPASST las ven sus integrantes y quien lee actas', async () => {
  const f = await sstFixture(scenario, 'copasst-actas');
  const minute = {
    committee: 'copasst',
    meeting_on: today(scenario),
    summary: 'Inspección mensual.',
  };
  expect((await scenario.post('/v1/sst/committee-minutes', f.sst.session, minute)).status).toBe(
    201,
  );
  const query = { committee: 'copasst' };
  expect((await scenario.post('/v1/sst/committee-minutes/read', f.hr.session, query)).status).toBe(
    200,
  );
  expect(
    (await scenario.post('/v1/sst/committee-minutes/read', f.worker.session, query)).status,
  ).toBe(403);
  await addMember(scenario, f, 'copasst', f.worker);
  expect(
    (await scenario.post('/v1/sst/committee-minutes/read', f.worker.session, query)).status,
  ).toBe(200);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  expect(mine.committees).toEqual(['copasst']);
});

it('la queja llega cifrada al comité; quien se queja solo ve el estado', async () => {
  const f = await sstFixture(scenario, 'convivencia-quejas');
  await addMember(scenario, f, 'coexistence', f.peer);
  const id = await fileComplaint(scenario, f.worker);
  const stored = await scenario.inTenant((tx) =>
    tx.sstCoexistenceComplaint.findFirstOrThrow({ where: { id } }),
  );
  expect(stored.factsEncrypted).not.toContain('grita');
  expect(stored.code).toMatch(/^CCL-\d{4}-\d{4}$/u);
  const event = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'sst.complaint.received',
        payload: { path: ['complaint_id'], equals: id },
      },
    }),
  );
  expect(JSON.stringify(event.payload)).not.toContain('grita');
  const { recipients } = RECIPIENTS.parse(event.payload);
  expect(recipients).toContain(f.peer.id);
  expect(recipients).not.toContain(f.worker.id);
  for (const outsider of [f.sst, f.hr, f.worker]) {
    expect((await scenario.post('/v1/sst/complaints/read', outsider.session)).status).toBe(403);
  }
  const list = complaintListResponseSchema.parse(
    (await scenario.post('/v1/sst/complaints/read', f.peer.session)).body,
  );
  expect(list.data.find((entry) => entry.id === id)?.facts).toContain('grita');
  const path = `/v1/sst/complaints/${id}/actions/handle`;
  const close = { status: 'closed', outcome: null };
  expect((await at(scenario, path, f.peer, 1, close)).status).toBe(422);
  expect((await at(scenario, path, f.sst, 1, { status: 'in_review', outcome: null })).status).toBe(
    403,
  );
  const done = { status: 'closed', outcome: 'Se hizo conciliación entre las partes.' };
  expect((await at(scenario, path, f.peer, 1, done)).status).toBe(204);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  expect(mine.complaints).toEqual([expect.objectContaining({ id, status: 'closed' })]);
  expect(mine.complaints[0]).not.toHaveProperty('facts');
});

it('solo SST gestiona los integrantes; otra empresa no ve los comités', async () => {
  const f = await sstFixture(scenario, 'comites-acceso');
  const body = {
    committee: 'copasst',
    user_id: f.peer.id,
    represents: 'workers',
    from_on: today(scenario),
  };
  expect((await scenario.post('/v1/sst/committee-members', f.hr.session, body)).status).toBe(403);
  const member = await addMember(scenario, f, 'coexistence', f.peer);
  const stranger = await scenario.person('comite-ajeno', ['SST', 'COLABORADOR'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get('/v1/sst/committee-members', stranger.session)).body).toEqual({
    data: [],
  });
  const end = { until_on: '2099-12-31' };
  const path = `/v1/sst/committee-members/${member}/actions/end`;
  expect((await at(scenario, path, stranger, 1, end)).status).toBe(404);
  expect((await scenario.post('/v1/sst/complaints/read', stranger.session)).status).toBe(403);
});
