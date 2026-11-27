import { legalPeriodStart, periodEndOf } from '@arza/contracts';
import { expect, it } from 'vitest';

import { addDays, fromCalendarDate } from '../../../src/modules/core/index.js';
import { publishTenantEvents } from '../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { runQmsDailyWork } from '../../../src/modules/qms/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { created, qualityFixture, today } from './support/qms-fixture.js';
import { complies, requirement } from './support/qms-legal-fixture.js';

// Aviso del normograma (B46, decisión 8): desde 30 días antes del fin del semestre, Calidad y la
// Dirección reciben un aviso con los requisitos sin evaluar; una sola vez por semestre.

const scenario = new AccessScenario('normograma aviso');

/** Mediodía en Colombia del día dado. */
function noonOf(day: string): Date {
  return new Date(fromCalendarDate(day).getTime() + 17 * 60 * 60 * 1000);
}

function semesterEnd(): string {
  return addDays(periodEndOf('semiannual', legalPeriodStart(today(scenario))), -1);
}

async function runOn(day: string) {
  return runQmsDailyWork({ database: scenario.db, clock: { now: () => noonOf(day) } });
}

async function noticesOf(person: Person): Promise<string[]> {
  await seedNotificationTemplates(apiDatabase(), [scenario.tenant.id], scenario.clock);
  await publishTenantEvents(
    { database: apiDatabase(), clock: scenario.clock },
    scenario.tenant.id,
    scenario.clock.now(),
  );
  const rows = await scenario.inTenant((tx) =>
    tx.notification.findMany({ where: { userId: person.id, kind: 'qms_legal_due' } }),
  );
  return rows.map((row) => `${row.title} ${row.body} ${row.link ?? ''}`);
}

it('avisa una vez los requisitos sin evaluar cuando faltan 30 días o menos', async () => {
  const f = await qualityFixture(scenario, 'aviso');
  const pending = await requirement(scenario, f);
  const evaluated = await requirement(scenario, f);
  created(
    await scenario.post(
      `/v1/qms/legal-requirements/${evaluated.id}/evaluations`,
      f.quality.session,
      complies(scenario),
    ),
  );
  const end = semesterEnd();
  await runOn(addDays(end, -40));
  expect(await noticesOf(f.quality)).toEqual([]);
  await runOn(addDays(end, -5));
  await runOn(addDays(end, -4));
  const [notice, ...more] = await noticesOf(f.director);
  expect(more).toEqual([]);
  expect(notice).toContain('/app/direccion/normograma');
  expect(notice).toContain(end.split('-').reverse().join('/'));
  expect(await noticesOf(f.quality)).toHaveLength(1);
  const rows = await scenario.inTenant((tx) =>
    tx.qmsLegalRequirement.findMany({ where: { id: { in: [pending.id, evaluated.id] } } }),
  );
  const reminded = rows.filter((row) => row.remindedPeriod !== null).map((row) => row.id);
  expect(reminded).toEqual([pending.id]);
});
