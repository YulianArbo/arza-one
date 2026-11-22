import { expect, it } from 'vitest';

import { runInnDailyWork } from '../../../src/modules/inn/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { coded, innFixture, later, trademark } from './support/inn-fixture.js';

// Alertas de renovación (B40, ficha 17.16, decisión 6): una marca a seis meses de vencer y un
// dominio a 60 días le dan a su responsable la tarea de renovarlo, una sola vez por vencimiento; lo
// que pasó su fecha queda vencido.

const scenario = new AccessScenario('innovacion renovaciones');

async function tasksOf(assetId: string) {
  return scenario.inTenant((tx) =>
    tx.workflowTask.findMany({ where: { instance: { entityId: assetId } } }),
  );
}

function daily() {
  return runInnDailyWork({ database: scenario.db, clock: scenario.clock });
}

it('la marca a seis meses y el dominio a 60 días generan su tarea una sola vez', async () => {
  const f = await innFixture(scenario, 'avisos');
  const post = async (body: object) =>
    coded(await scenario.post('/v1/innovation/ip-assets', f.quality.session, body)).id;
  const mark = await post(trademark(scenario, f.tech.id, 170));
  const farMark = await post(trademark(scenario, f.tech.id, 200));
  const domain = (days: number) => ({
    kind: 'domain',
    title: `dominio-${String(days)}.example`,
    holder: 'Empresa de prueba S.A.S.',
    filed_on: later(scenario, -300),
    expires_on: later(scenario, days),
    status: 'registered',
    responsible_id: f.quality.id,
  });
  const nearDomain = await post(domain(45));
  const farDomain = await post(domain(90));
  await daily();
  const markTasks = await tasksOf(mark);
  const farTasks = await tasksOf(farMark);
  const nearTasks = await tasksOf(nearDomain);
  const laterTasks = await tasksOf(farDomain);
  expect(markTasks).toHaveLength(1);
  expect(markTasks[0]).toMatchObject({ assigneeId: f.tech.id, status: 'pending' });
  expect(markTasks[0]?.title).toContain('Renovar marca');
  expect(farTasks).toHaveLength(0);
  expect(nearTasks).toHaveLength(1);
  expect(laterTasks).toHaveLength(0);
  await daily();
  expect(await tasksOf(mark)).toHaveLength(1);
  const stored = await scenario.inTenant((tx) =>
    tx.innIpAsset.findFirstOrThrow({ where: { id: mark } }),
  );
  expect(stored.renewalAlertedFor?.getTime()).toBe(stored.expiresOn?.getTime());
  const events = await scenario.inTenant((tx) =>
    tx.auditEvent.count({ where: { entityId: mark, action: 'inn.asset.renewal_alert' } }),
  );
  expect(events).toBe(1);
});

it('lo que pasó su fecha sin renovarse queda vencido', async () => {
  const f = await innFixture(scenario, 'vencido');
  const body = { ...trademark(scenario, f.quality.id, 10) };
  const { id } = coded(await scenario.post('/v1/innovation/ip-assets', f.quality.session, body));
  scenario.clock.advance(11 * 24 * 60 * 60 * 1000);
  try {
    await daily();
  } finally {
    scenario.clock.advance(-11 * 24 * 60 * 60 * 1000);
  }
  const stored = await scenario.inTenant((tx) => tx.innIpAsset.findFirstOrThrow({ where: { id } }));
  expect(stored.status).toBe('expired');
});
