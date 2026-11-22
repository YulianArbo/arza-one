import { expect, it } from 'vitest';

import { publishTenantEvents } from '../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { runQmsDailyWork } from '../../../src/modules/qms/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import {
  actionBody,
  coded,
  executed,
  qualityFixture,
  reported,
  today,
} from './support/qms-fixture.js';

// Avisos de Calidad de punta a punta (B38): reporte, acción asignada, acción por verificar y
// acción vencida. Quien hace la acción no se avisa a sí mismo.

const scenario = new AccessScenario('avisos de calidad');
const DAY = 24 * 60 * 60 * 1000;

async function publish(): Promise<void> {
  await seedNotificationTemplates(apiDatabase(), [scenario.tenant.id], scenario.clock);
  await publishTenantEvents(
    { database: apiDatabase(), clock: scenario.clock },
    scenario.tenant.id,
    scenario.clock.now(),
  );
}

async function noticesOf(person: Person, kind: string): Promise<string[]> {
  const rows = await scenario.inTenant((tx) =>
    tx.notification.findMany({ where: { userId: person.id, kind } }),
  );
  return rows.map((row) => `${row.title} ${row.body} ${row.link ?? ''}`);
}

it('cada paso de Calidad avisa a quien debe actuar y no a quien lo hizo', async () => {
  const f = await qualityFixture(scenario, 'avisos');
  await reported(scenario, f.worker);
  const due = today(scenario);
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, due);
  const { id, code } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  expect((await executed(scenario, f.worker, id)).status).toBe(204);
  await runQmsDailyWork({
    database: scenario.db,
    clock: { now: () => new Date(scenario.clock.now().getTime() + 2 * DAY) },
  });
  await publish();

  expect((await noticesOf(f.quality, 'qms_nonconformity_reported')).join(' ')).toContain(
    '/app/calidad/no-conformidades',
  );
  expect(await noticesOf(f.worker, 'qms_nonconformity_reported')).toEqual([]);
  const assigned = (await noticesOf(f.worker, 'qms_action_assigned')).join(' ');
  expect(assigned).toContain(code);
  expect(assigned).toContain(due.split('-').reverse().join('/'));
  expect(await noticesOf(f.quality, 'qms_action_assigned')).toEqual([]);
  expect((await noticesOf(f.verifier, 'qms_action_to_verify')).join(' ')).toContain(code);
  expect(await noticesOf(f.worker, 'qms_action_to_verify')).toEqual([]);
});

it('una acción vencida avisa al responsable y a la Dirección', async () => {
  const f = await qualityFixture(scenario, 'vencida');
  const due = today(scenario);
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, due);
  const { code } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  await runQmsDailyWork({
    database: scenario.db,
    clock: { now: () => new Date(scenario.clock.now().getTime() + 2 * DAY) },
  });
  await publish();
  for (const person of [f.worker, f.director]) {
    expect((await noticesOf(person, 'qms_action_overdue')).join(' ')).toContain(code);
  }
});
