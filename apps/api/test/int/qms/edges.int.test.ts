import { contextItemListResponseSchema, qmsActionListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  actionBody,
  at,
  coded,
  created,
  executed,
  later,
  processId,
  qualityFixture,
  today,
  verification,
} from './support/qms-fixture.js';

// Casos límite de Calidad (B38): acciones que salen de un riesgo, pasos sobre acciones que no
// existen o que no están en el estado debido, la matriz de contexto sin año y una caracterización
// inexistente.

const scenario = new AccessScenario('calidad casos limite');
const GHOST = '01900000-0000-7000-8000-00000000dead';

async function riskId(owner: string, quality: Parameters<AccessScenario['post']>[1]) {
  const risk = {
    kind: 'risk',
    process_id: await processId(scenario),
    description: 'Rotación del equipo de soporte',
    probability: 3,
    impact: 3,
    treatment: 'mitigate',
    owner_id: owner,
    review_on: later(scenario, 30),
  };
  return created(await scenario.post('/v1/qms/risks', quality, risk));
}

it('una acción de un riesgo es de mejora y no sale de un riesgo inexistente', async () => {
  const f = await qualityFixture(scenario, 'riesgo-accion');
  const risk = await riskId(f.worker.id, f.quality.session);
  const ghost = actionBody({ type: 'risk', id: GHOST }, f.worker.id, later(scenario, 5));
  expect((await scenario.post('/v1/qms/actions', f.quality.session, ghost)).status).toBe(422);
  const body = actionBody({ type: 'risk', id: risk }, f.worker.id, later(scenario, 5));
  const { id } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  const log = qmsActionListResponseSchema.parse(
    (await scenario.get('/v1/qms/actions?origin_type=risk', f.director.session)).body,
  );
  expect(log.data.find((action) => action.id === id)).toMatchObject({
    origin_type: 'risk',
    action_type: 'improvement',
  });
});

it('no se ejecuta ni verifica lo que no existe o no está en el estado debido', async () => {
  const f = await qualityFixture(scenario, 'estados');
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, later(scenario, 5));
  const { id } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  const verify = (actionId: string, version: number) =>
    at(
      scenario,
      `/v1/qms/actions/${actionId}/actions/verify`,
      f.verifier,
      version,
      verification(scenario, true),
    );
  expect((await executed(scenario, f.worker, GHOST)).status).toBe(404);
  expect((await verify(GHOST, 1)).status).toBe(404);
  expect((await verify(id, 1)).status).toBe(409);
  expect((await executed(scenario, f.worker, id)).status).toBe(204);
  const again = { evidence_note: 'Otra vez', executed_on: today(scenario) };
  const repeat = at(scenario, `/v1/qms/actions/${id}/actions/execute`, f.quality, 2, again);
  expect((await repeat).status).toBe(409);
});

it('la matriz de contexto sin año trae todos los años y la caracterización ajena no existe', async () => {
  const f = await qualityFixture(scenario, 'contexto-anios');
  const year = Number(today(scenario).slice(0, 4));
  const item = (kind: string, itemYear: number) => ({
    kind,
    pestel_factor: null,
    description: `Factor del año ${String(itemYear)}`,
    impact: 'low',
    year: itemYear,
  });
  const now = created(
    await scenario.post('/v1/qms/context', f.quality.session, item('weakness', year)),
  );
  const before = created(
    await scenario.post('/v1/qms/context', f.quality.session, item('strength', year - 1)),
  );
  const all = contextItemListResponseSchema.parse(
    (await scenario.get('/v1/qms/context', f.auditor.session)).body,
  );
  expect(all.data.map((row) => row.id)).toEqual(expect.arrayContaining([now, before]));
  const patch = await scenario.patch(
    `/v1/qms/characterizations/${GHOST}`,
    f.quality.session,
    { process_type: 'support', objective: 'Sin dueño', document_id: null },
    1,
  );
  expect(patch.status).toBe(404);
});
