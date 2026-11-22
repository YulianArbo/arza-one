import { nonconformityListResponseSchema, qmsActionListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  actionBody,
  analyzed,
  at,
  coded,
  detail,
  executed,
  later,
  plannedNonconformity,
  qualityFixture,
  reported,
  today,
  verification,
} from './support/qms-fixture.js';

// No conformidades y acciones de punta a punta (B38, ficha 17.15; decisiones 3, 6, 7 y 8).

const scenario = new AccessScenario('calidad no conformidades');

it('el colaborador reporta y ve lo suyo; solo quien lee Calidad ve todas', async () => {
  const f = await qualityFixture(scenario, 'reporte');
  const id = await reported(scenario, f.worker);
  const mine = nonconformityListResponseSchema.parse(
    (await scenario.get('/v1/qms/my/nonconformities', f.worker.session)).body,
  );
  expect(mine.data.map((nc) => nc.id)).toContain(id);
  expect(mine.data[0]).toMatchObject({ status: 'detected', source: 'report', origin: null });
  expect((await scenario.get('/v1/qms/nonconformities', f.worker.session)).status).toBe(403);
  expect((await scenario.get(`/v1/qms/nonconformities/${id}`, f.worker.session)).status).toBe(403);
  for (const reader of [f.quality, f.director, f.auditor]) {
    const all = nonconformityListResponseSchema.parse(
      (await scenario.get('/v1/qms/nonconformities', reader.session)).body,
    );
    expect(all.data.map((nc) => nc.id)).toContain(id);
  }
  const future = { description: 'Algo que aún no ha pasado.', detected_on: later(scenario, 2) };
  expect((await scenario.post('/v1/qms/nonconformities', f.worker.session, future)).status).toBe(
    422,
  );
});

it('sigue el flujo y exige corrección, causa raíz y acción antes del plan', async () => {
  const f = await qualityFixture(scenario, 'flujo');
  const id = await reported(scenario, f.worker);
  const base = `/v1/qms/nonconformities/${id}/actions`;
  expect((await at(scenario, `${base}/analyze`, f.quality, 1, {})).status).toBe(422);
  expect((await at(scenario, `${base}/plan`, f.quality, 1)).status).toBe(409);
  const contain = {
    classification: 'major',
    process_id: id,
    containment: 'Se retiró.',
    contained_on: today(scenario),
  };
  expect((await at(scenario, `${base}/contain`, f.worker, 1, contain)).status).toBe(403);
  expect((await at(scenario, `${base}/contain`, f.quality, 1, contain)).status).toBe(422);
  const version = await analyzed(scenario, f, id);
  expect((await at(scenario, `${base}/plan`, f.quality, version)).status).toBe(422);
  expect((await at(scenario, `${base}/plan`, f.quality, 1)).status).toBe(409);
  const nc = await detail(scenario, f.auditor, id);
  expect(nc.nonconformity).toMatchObject({
    status: 'analyzing',
    classification: 'minor',
    root_cause: 'El procedimiento no asigna quién revisa el informe.',
    analysis: { method: 'five_whys' },
  });
});

it('verifica la eficacia alguien distinto del responsable y la no conformidad se cierra', async () => {
  const f = await qualityFixture(scenario, 'eficacia');
  const { id, actionId } = await plannedNonconformity(scenario, f);
  const mine = qmsActionListResponseSchema.parse(
    (await scenario.get('/v1/qms/my/actions', f.worker.session)).body,
  );
  expect(mine.data.find((action) => action.id === actionId)).toMatchObject({
    action_type: 'corrective',
    status: 'open',
    origin: { id },
  });
  const other = await scenario.person('eficacia-otro', ['COLABORADOR']);
  expect((await executed(scenario, other, actionId)).status).toBe(404);
  expect((await executed(scenario, f.worker, actionId)).status).toBe(204);
  const verify = `/v1/qms/actions/${actionId}/actions/verify`;
  const effective = verification(scenario, true);
  expect((await at(scenario, verify, f.worker, 2, effective)).status).toBe(403);
  const self = await scenario.person('eficacia-mismo', ['CALIDAD']);
  const own = actionBody({ type: 'improvement', id: null }, self.id, later(scenario, 5));
  const ownId = coded(await scenario.post('/v1/qms/actions', f.quality.session, own)).id;
  expect((await executed(scenario, self, ownId)).status).toBe(204);
  const selfCheck = await at(
    scenario,
    `/v1/qms/actions/${ownId}/actions/verify`,
    self,
    2,
    effective,
  );
  expect(selfCheck.status).toBe(403);
  expect(errorCode(selfCheck)).toBe('QMS_SELF_VERIFICATION');
  expect((await at(scenario, verify, f.verifier, 2, effective)).status).toBe(204);
  expect((await detail(scenario, f.quality, id)).nonconformity.status).toBe('verified');
  const close = `/v1/qms/nonconformities/${id}/actions/close`;
  expect((await at(scenario, close, f.worker, 5, { note: null })).status).toBe(403);
  expect((await at(scenario, close, f.director, 5, { note: 'Eficaz.' })).status).toBe(204);
  expect((await detail(scenario, f.auditor, id)).nonconformity).toMatchObject({
    status: 'closed',
    closed_on: today(scenario),
  });
});

it('una acción no eficaz reabre la no conformidad, que vuelve a análisis', async () => {
  const f = await qualityFixture(scenario, 'reabre');
  const { id, actionId } = await plannedNonconformity(scenario, f);
  expect((await executed(scenario, f.quality, actionId)).status).toBe(204);
  const verify = `/v1/qms/actions/${actionId}/actions/verify`;
  expect((await at(scenario, verify, f.quality, 2, verification(scenario, true))).status).toBe(403);
  expect((await at(scenario, verify, f.director, 2, verification(scenario, false))).status).toBe(
    204,
  );
  const reopened = await detail(scenario, f.quality, id);
  expect(reopened.nonconformity).toMatchObject({ status: 'reopened' });
  expect(reopened.nonconformity.reopen_reason).toContain('no fue eficaz');
  expect(reopened.actions[0]).toMatchObject({
    status: 'ineffective',
    verified_by: { id: f.director.id },
  });
  const again = `/v1/qms/nonconformities/${id}/actions/analyze`;
  const analysis = {
    analysis: { method: 'ishikawa', causes: { method: ['No hay lista de verificación'] } },
    root_cause: 'Falta una lista de verificación del informe.',
  };
  expect((await at(scenario, again, f.quality, 5, analysis)).status).toBe(204);
});

it('otra empresa no ve ni toca las no conformidades', async () => {
  const f = await qualityFixture(scenario, 'aislamiento');
  const id = await reported(scenario, f.worker);
  const stranger = await scenario.person('calidad-ajena', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = nonconformityListResponseSchema.parse(
    (await scenario.get('/v1/qms/nonconformities', stranger.session)).body,
  );
  expect(theirs.data.map((nc) => nc.id)).not.toContain(id);
  expect((await scenario.get(`/v1/qms/nonconformities/${id}`, stranger.session)).status).toBe(404);
  const contain = {
    classification: 'minor',
    process_id: id,
    containment: 'Intento ajeno.',
    contained_on: today(scenario),
  };
  const response = await at(
    scenario,
    `/v1/qms/nonconformities/${id}/actions/contain`,
    stranger,
    1,
    contain,
  );
  expect(response.status).toBe(404);
});
