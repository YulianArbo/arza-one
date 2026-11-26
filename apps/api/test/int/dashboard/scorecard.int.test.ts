import { scorecardResponseSchema, type Scorecard } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import {
  indicatorBody,
  measurementBody,
  monthStart,
  placeIn,
  put,
} from '../qms/support/qms-b39-fixture.js';
import { coded, created, processId, qualityFixture } from '../qms/support/qms-fixture.js';
import { objectiveBody } from '../qms/support/qms-legal-fixture.js';

// Cuadro de mando (B46, decisiones 4 y 5): objetivos por perspectiva con sus indicadores. La
// Dirección, Calidad y el Auditor ven toda la empresa; los demás, los procesos de su cargo.

const scenario = new AccessScenario('cuadro de mando');

async function scorecardOf(person: Person): Promise<Scorecard> {
  const response = await scenario.get('/v1/dashboards/scorecard/data', person.session);
  expect(response.status, response.text).toBe(200);
  return scorecardResponseSchema.parse(response.body);
}

function objectiveIn(data: Scorecard, id: string) {
  return data.perspectives
    .flatMap((item) => item.objectives.map((objective) => ({ ...objective, of: item.perspective })))
    .find((objective) => objective.id === id);
}

it('el objetivo muestra sus indicadores y si cumplen, según quién mira', async () => {
  const f = await qualityFixture(scenario, 'mando');
  const body = await indicatorBody(scenario, f.worker.id);
  const indicator = coded(await scenario.post('/v1/qms/indicators', f.quality.session, body)).id;
  const path = `/v1/qms/indicators/${indicator}/measurements`;
  created(
    await scenario.post(path, f.worker.session, measurementBody(monthStart(scenario, 1), '4.5')),
  );
  const objectives = '/v1/qms/strategic-objectives';
  const { id } = coded(await scenario.post(objectives, f.quality.session, objectiveBody()));
  await put(scenario, `${objectives}/${id}/indicators`, f.quality, 1, {
    indicator_ids: [indicator],
  });

  const all = await scorecardOf(f.director);
  expect(all.scope).toBe('all');
  expect(objectiveIn(all, id)).toMatchObject({
    of: 'customer',
    status: 'meets',
    indicators: [{ id: indicator, value: '4.5', meets: true }],
  });

  const seller = await scenario.person('comercial-proceso', ['COMERCIAL']);
  await placeIn(scenario, seller, await processId(scenario, 0));
  const own = await scorecardOf(seller);
  expect(own.scope).toBe('own');
  expect(objectiveIn(own, id)?.indicators).toHaveLength(1);

  const outsider = await scenario.person('comercial-sin-cargo', ['COMERCIAL']);
  expect(objectiveIn(await scorecardOf(outsider), id)).toBeUndefined();
});

it('otra empresa no ve los objetivos de esta', async () => {
  const f = await qualityFixture(scenario, 'mando-aislado');
  const { id } = coded(
    await scenario.post('/v1/qms/strategic-objectives', f.quality.session, objectiveBody()),
  );
  const other = await scenario.person('direccion-otra', ['DIRECCION'], {
    tenantId: scenario.otherTenant.id,
  });
  expect(objectiveIn(await scorecardOf(other), id)).toBeUndefined();
  expect(objectiveIn(await scorecardOf(f.director), id)).toMatchObject({ status: 'no_data' });
});
