import {
  hazardListResponseSchema,
  inspectionListResponseSchema,
  mySstSchema,
  standardsAssessmentSchema,
  standardsScoreSchema,
  workPlanResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { addDays } from '../../../src/modules/core/index.js';
import { runSstDailyWork } from '../../../src/modules/sst/index.js';
import { availableFile } from '../hr/support/people-fixture.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  answersFor,
  at,
  created,
  hazardBody,
  homeRequest,
  processId,
  put,
  sstFixture,
  today,
} from './support/sst-fixture.js';

// Matriz de peligros (GTC 45), plan anual con evidencias, inspecciones y autoevaluación de
// estándares mínimos (B37, decisiones 3, 4, 11 y 14; ficha 17.14).

const scenario = new AccessScenario('sst planeacion');

it('la plataforma calcula el nivel de riesgo y solo SST edita la matriz', async () => {
  const f = await sstFixture(scenario, 'peligros');
  const body = hazardBody(await processId(scenario), addDays(today(scenario), 180));
  expect((await scenario.post('/v1/sst/hazards', f.hr.session, body)).status).toBe(403);
  const id = created(await scenario.post('/v1/sst/hazards', f.sst.session, body));
  const list = hazardListResponseSchema.parse(
    (await scenario.get('/v1/sst/hazards', f.hr.session)).body,
  );
  expect(list.data.find((hazard) => hazard.id === id)).toMatchObject({
    probability: 24,
    risk: 600,
    risk_level: 'I',
  });
  const lower = { ...body, exposure: 1 };
  expect((await scenario.patch(`/v1/sst/hazards/${id}`, f.sst.session, lower, 1)).status).toBe(204);
  expect((await scenario.patch(`/v1/sst/hazards/${id}`, f.sst.session, lower, 1)).status).toBe(409);
  const stored = await scenario.inTenant((tx) => tx.sstHazard.findFirstOrThrow({ where: { id } }));
  expect(stored).toMatchObject({ probability: 6, risk: 150, riskLevel: 'II' });
  const missing = { ...body, process_id: '01900000-0000-7000-8000-00000000dead' };
  expect((await scenario.post('/v1/sst/hazards', f.sst.session, missing)).status).toBe(422);
  expect((await scenario.get('/v1/sst/hazards', f.worker.session)).status).toBe(403);
  const stranger = await scenario.person('peligros-ajeno', ['SST'], {
    tenantId: scenario.otherTenant.id,
  });
  const ajena = hazardListResponseSchema.parse(
    (await scenario.get('/v1/sst/hazards', stranger.session)).body,
  );
  expect(ajena.data.map((hazard) => hazard.id)).not.toContain(id);
});

it('una actividad del plan se da por hecha solo con evidencia y el plan da su cumplimiento', async () => {
  const f = await sstFixture(scenario, 'plan');
  const year = Number(today(scenario).slice(0, 4));
  const item = (activity: string, due: string) => ({
    year,
    activity,
    responsible_id: f.sst.id,
    due_on: due,
  });
  const first = created(
    await scenario.post('/v1/sst/work-plan', f.sst.session, item('Capacitación', today(scenario))),
  );
  const wrongYear = item('Fuera del año', `${String(year + 1)}-01-10`);
  expect((await scenario.post('/v1/sst/work-plan', f.sst.session, wrongYear)).status).toBe(422);
  const path = `/v1/sst/work-plan/${first}/actions/complete`;
  const noEvidence = {
    done_on: today(scenario),
    evidence_file_id: '01900000-0000-7000-8000-00000000dead',
  };
  expect((await at(scenario, path, f.sst, 1, noEvidence)).status).toBe(422);
  const evidence = {
    done_on: today(scenario),
    evidence_file_id: await availableFile(scenario, f.sst),
  };
  expect((await at(scenario, path, f.hr, 1, evidence)).status).toBe(403);
  expect((await at(scenario, path, f.sst, 1, evidence)).status).toBe(204);
  const plan = workPlanResponseSchema.parse(
    (await scenario.get(`/v1/sst/work-plan?year=${String(year)}`, f.hr.session)).body,
  );
  const mine = plan.data.find((entry) => entry.id === first);
  expect(mine).toMatchObject({ done_on: today(scenario), overdue: false });
  expect(plan.compliance.done).toBeGreaterThanOrEqual(1);
  expect(plan.compliance.year_percent).toBeGreaterThan(0);
});

it('avisa una vez al responsable de una actividad vencida', async () => {
  const f = await sstFixture(scenario, 'plan-vencido');
  const year = Number(today(scenario).slice(0, 4));
  const body = {
    year,
    activity: 'Revisar extintores',
    responsible_id: f.worker.id,
    due_on: today(scenario),
  };
  const id = created(await scenario.post('/v1/sst/work-plan', f.sst.session, body));
  const later = new Date(scenario.clock.now().getTime() + 2 * 24 * 60 * 60 * 1000);
  const run = () => runSstDailyWork({ database: scenario.db, clock: { now: () => later } });
  await run();
  await run();
  const notices = await scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: {
        eventType: 'sst.task.assigned',
        payload: { path: ['item_id'], equals: id },
        actorId: null,
      },
    }),
  );
  expect(notices).toBe(1);
});

it('la autoinspección en casa la responde el colaborador y la revisa SST', async () => {
  const f = await sstFixture(scenario, 'casa');
  const id = await homeRequest(scenario, f);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  const pending = mine.home_inspections.find((entry) => entry.id === id);
  expect(pending?.checklist.length).toBeGreaterThan(0);
  const answers = await answersFor(scenario, 'home');
  const path = `/v1/sst/me/inspections/${id}/answers`;
  const partial = { place: 'Bogotá, Chapinero', answers: answers.slice(1) };
  expect((await at(scenario, path, f.worker, 1, partial)).status).toBe(422);
  expect((await at(scenario, path, f.peer, 1, { ...partial, answers })).status).toBe(404);
  expect((await at(scenario, path, f.worker, 1, { ...partial, answers })).status).toBe(204);
  const review = { findings: 'Ajustar la altura de la silla.' };
  expect(
    (await at(scenario, `/v1/sst/inspections/${id}/actions/review`, f.hr, 2, review)).status,
  ).toBe(403);
  expect(
    (await at(scenario, `/v1/sst/inspections/${id}/actions/review`, f.sst, 2, review)).status,
  ).toBe(204);
  const list = inspectionListResponseSchema.parse(
    (await scenario.get('/v1/sst/inspections', f.hr.session)).body,
  );
  expect(list.data.find((entry) => entry.id === id)).toMatchObject({
    status: 'reviewed',
    failed: 1,
    findings: review.findings,
  });
});

it('la autoevaluación suma el peso de cada estándar y clasifica el puntaje', async () => {
  const f = await sstFixture(scenario, 'estandares');
  const year = 2030;
  const base = `/v1/sst/standards-assessments/${String(year)}`;
  expect((await put(scenario, `${base}/standards/5.1.1`, f.hr, { result: 'meets' })).status).toBe(
    403,
  );
  expect((await put(scenario, `${base}/standards/5.1.1`, f.sst, { result: 'meets' })).status).toBe(
    204,
  );
  expect((await put(scenario, `${base}/standards/5.1.1`, f.sst, { result: 'meets' })).status).toBe(
    409,
  );
  const notMet = { result: 'not_met', improvement: 'Conformar la brigada.' };
  expect((await put(scenario, `${base}/standards/5.1.2`, f.sst, notMet)).status).toBe(204);
  const na = { result: 'not_applicable', justification: 'No hay trabajadores de alto riesgo.' };
  expect((await put(scenario, `${base}/standards/1.1.5`, f.sst, na)).status).toBe(204);
  expect((await put(scenario, `${base}/standards/9.9.9`, f.sst, na)).status).toBe(404);
  const changed = await put(scenario, `${base}/standards/5.1.2`, f.sst, { result: 'meets' }, 1);
  expect(changed.status).toBe(204);
  const score = standardsScoreSchema.parse(
    (await scenario.get(`${base}/score`, f.hr.session)).body,
  );
  expect(score).toEqual({ year, score: 1050, rating: 'critical', assessed: 3, total: 60 });
  const assessment = standardsAssessmentSchema.parse(
    (await scenario.get(base, f.sst.session)).body,
  );
  expect(assessment.data.find((item) => item.code === '1.1.5')).toMatchObject({
    result: 'not_applicable',
    version: 1,
  });
  const stranger = await scenario.person('estandares-ajeno', ['SST'], {
    tenantId: scenario.otherTenant.id,
  });
  const other = standardsScoreSchema.parse(
    (await scenario.get(`${base}/score`, stranger.session)).body,
  );
  expect(other.assessed).toBe(0);
});
