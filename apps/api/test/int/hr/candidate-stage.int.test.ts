import { expect, it } from 'vitest';

import { bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { candidateFixture } from './support/candidate-fixture.js';

const scenario = new AccessScenario('etapas de selección');

it('avanza y descarta con control de versión y fecha de eliminación', async () => {
  const recruiter = await scenario.person('seleccion', ['TALENTO_HUMANO']);
  const other = await scenario.person('seleccion-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  const { id } = await candidateFixture(scenario);
  const path = `/v1/hr/candidates/${id}/actions`;
  expect(
    (await scenario.post(`${path}/advance`, other.session).set('If-Match', '"1"')).status,
  ).toBe(404);
  expect(
    (await scenario.post(`${path}/advance`, recruiter.session).set('If-Match', '"1"')).status,
  ).toBe(204);
  const discard = (version: string) =>
    scenario
      .post(`${path}/discard`, recruiter.session, {
        reason: 'Proceso finalizado',
      })
      .set('If-Match', version);
  expect((await discard('"1"')).status).toBe(409);
  expect((await discard('"2"')).status).toBe(204);
  const row = await scenario.inTenant((tx) => tx.hrCandidate.findUniqueOrThrow({ where: { id } }));
  const today = bogotaToday(scenario.clock.now());
  const nextYear = Number(today.slice(0, 4)) + 1;
  expect(row.stage).toBe('discarded');
  expect(row.discardedOn?.toISOString().slice(0, 10)).toBe(today);
  expect(row.retentionUntil?.toISOString().slice(0, 10)).toBe(
    `${String(nextYear)}${today.slice(4)}`,
  );
});
