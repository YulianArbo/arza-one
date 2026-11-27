import { strategicObjectiveListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { indicatorBody, put } from './support/qms-b39-fixture.js';
import { coded, qualityFixture, type QualityStaff } from './support/qms-fixture.js';
import { objectiveBody } from './support/qms-legal-fixture.js';

// Objetivos del plan estratégico para el cuadro de mando (B46, decisión 4).

const scenario = new AccessScenario('objetivos estrategicos');
const BASE = '/v1/qms/strategic-objectives';

async function indicator(f: QualityStaff): Promise<string> {
  const body = await indicatorBody(scenario, f.worker.id);
  return coded(await scenario.post('/v1/qms/indicators', f.quality.session, body)).id;
}

async function objectives(f: QualityStaff) {
  const response = await scenario.get(BASE, f.director.session);
  if (response.status !== 200) throw new Error(response.text);
  return strategicObjectiveListResponseSchema.parse(response.body).data;
}

it('Calidad registra el objetivo y le asigna indicadores; la Dirección lo consulta', async () => {
  const f = await qualityFixture(scenario, 'objetivo');
  expect((await scenario.post(BASE, f.director.session, objectiveBody())).status).toBe(403);
  const { id, code } = coded(await scenario.post(BASE, f.quality.session, objectiveBody()));
  expect(code).toMatch(/^OBJ-\d{3,}$/u);
  const [first, second] = [await indicator(f), await indicator(f)];
  const link = (ids: string[]) =>
    put(scenario, `${BASE}/${id}/indicators`, f.quality, 1, { indicator_ids: ids });
  expect((await link([first, second])).status).toBe(204);
  expect((await link([second])).status).toBe(204);
  expect((await objectives(f)).find((item) => item.id === id)?.indicator_ids).toEqual([second]);
  expect((await link([])).status).toBe(204);
  expect((await objectives(f)).find((item) => item.id === id)?.indicator_ids).toEqual([]);
  const changed = objectiveBody({ name: 'Clientes fieles', active: false });
  expect((await scenario.patch(`${BASE}/${id}`, f.quality.session, changed, 1)).status).toBe(204);
  expect((await scenario.patch(`${BASE}/${id}`, f.quality.session, changed, 1)).status).toBe(409);
  expect((await objectives(f)).find((item) => item.id === id)).toMatchObject({ active: false });
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'qms.strategic_objective.create:success',
    'qms.strategic_objective.link:success',
    'qms.strategic_objective.link:success',
    'qms.strategic_objective.link:success',
    'qms.strategic_objective.update:success',
  ]);
});

it('los años deben ser coherentes y el colaborador no consulta', async () => {
  const f = await qualityFixture(scenario, 'objetivo-reglas');
  const wrong = objectiveBody({ year_from: 2028, year_to: 2026 });
  expect((await scenario.post(BASE, f.quality.session, wrong)).status).toBe(422);
  expect((await scenario.get(BASE, f.worker.session)).status).toBe(403);
});

it('no se asignan indicadores de otra empresa ni objetivos ajenos', async () => {
  const f = await qualityFixture(scenario, 'objetivo-aislado');
  const { id } = coded(await scenario.post(BASE, f.quality.session, objectiveBody()));
  const other = await scenario.person('calidad-otra', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  const own = await indicator(f);
  const foreign = await put(scenario, `${BASE}/${id}/indicators`, other, 1, {
    indicator_ids: [],
  });
  expect(foreign.status).toBe(404);
  expect((await scenario.patch(`${BASE}/${id}`, other.session, objectiveBody(), 1)).status).toBe(
    404,
  );
  const otherObjective = coded(await scenario.post(BASE, other.session, objectiveBody())).id;
  const crossed = await put(scenario, `${BASE}/${otherObjective}/indicators`, other, 1, {
    indicator_ids: [own],
  });
  expect(crossed.status).toBe(422);
});
