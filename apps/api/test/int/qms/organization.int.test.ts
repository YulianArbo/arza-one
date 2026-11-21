import {
  contextItemListResponseSchema,
  lessonListResponseSchema,
  qmsProcessListResponseSchema,
  qmsRefListResponseSchema,
  qmsRiskListResponseSchema,
  stakeholderListResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { created, later, processId, qualityFixture, reported } from './support/qms-fixture.js';

// Mapa de procesos, contexto DOFA-PESTEL, partes interesadas, riesgos y lecciones aprendidas
// (B38, ficha 17.15; decisiones 3 y 9).

const scenario = new AccessScenario('calidad organizacion');

const CHARACTERIZATION = {
  process_type: 'support',
  objective: 'Asegurar que el sistema de gestión cumpla sus objetivos.',
  inputs: 'Resultados de auditoría',
};

it('Calidad caracteriza los procesos del núcleo; la Dirección los ve y no los edita', async () => {
  const f = await qualityFixture(scenario, 'procesos');
  const process = await processId(scenario, 1);
  const path = `/v1/qms/processes/${process}/characterization`;
  expect((await scenario.post(path, f.director.session, CHARACTERIZATION)).status).toBe(403);
  const id = created(await scenario.post(path, f.quality.session, CHARACTERIZATION));
  expect((await scenario.post(path, f.quality.session, CHARACTERIZATION)).status).toBe(409);
  const update = { ...CHARACTERIZATION, process_type: 'strategic' };
  const patch = `/v1/qms/characterizations/${id}`;
  expect((await scenario.patch(patch, f.quality.session, update, 1)).status).toBe(204);
  expect((await scenario.patch(patch, f.quality.session, update, 1)).status).toBe(409);
  const map = qmsProcessListResponseSchema.parse(
    (await scenario.get('/v1/qms/processes', f.director.session)).body,
  );
  expect(map.data.find((item) => item.id === process)?.characterization).toMatchObject({
    process_type: 'strategic',
    version: 2,
  });
  const ghost = '/v1/qms/processes/01900000-0000-7000-8000-00000000dead/characterization';
  expect((await scenario.post(ghost, f.quality.session, CHARACTERIZATION)).status).toBe(422);
  expect((await scenario.get('/v1/qms/processes', f.worker.session)).status).toBe(403);
});

it('la matriz DOFA-PESTEL y las partes interesadas las registra Calidad', async () => {
  const f = await qualityFixture(scenario, 'contexto');
  const year = Number(later(scenario, 0).slice(0, 4));
  const threat = {
    kind: 'threat',
    pestel_factor: 'legal',
    description: 'Cambio en la facturación electrónica',
    impact: 'high',
    year,
  };
  expect((await scenario.post('/v1/qms/context', f.worker.session, threat)).status).toBe(403);
  const id = created(await scenario.post('/v1/qms/context', f.quality.session, threat));
  const strength = { ...threat, kind: 'strength' };
  expect((await scenario.post('/v1/qms/context', f.quality.session, strength)).status).toBe(422);
  const items = contextItemListResponseSchema.parse(
    (await scenario.get(`/v1/qms/context?year=${String(year)}`, f.auditor.session)).body,
  );
  expect(items.data.find((item) => item.id === id)).toMatchObject({ pestel_factor: 'legal' });
  const party = {
    name: 'Clientes',
    stakeholder_type: 'external',
    needs: 'Software que funcione',
    expectations: 'Respuesta oportuna',
    monitoring: 'Encuestas de satisfacción',
  };
  const partyId = created(await scenario.post('/v1/qms/stakeholders', f.quality.session, party));
  const renamed = { ...party, name: 'Clientes corporativos' };
  const patch = `/v1/qms/stakeholders/${partyId}`;
  expect((await scenario.patch(patch, f.quality.session, renamed, 1)).status).toBe(204);
  const parties = stakeholderListResponseSchema.parse(
    (await scenario.get('/v1/qms/stakeholders', f.director.session)).body,
  );
  expect(parties.data.find((item) => item.id === partyId)?.name).toBe('Clientes corporativos');
});

async function riskBody(owner: string): Promise<Record<string, unknown>> {
  return {
    kind: 'risk',
    process_id: await processId(scenario),
    description: 'Pérdida del servidor de respaldo',
    probability: 4,
    impact: 5,
    treatment: 'mitigate',
    owner_id: owner,
    review_on: later(scenario, -1),
  };
}

it('la plataforma calcula el nivel del riesgo y solo Calidad lo registra', async () => {
  const f = await qualityFixture(scenario, 'riesgos');
  const risk = await riskBody(f.worker.id);
  expect((await scenario.post('/v1/qms/risks', f.worker.session, risk)).status).toBe(403);
  const ghostOwner = { ...risk, owner_id: '01900000-0000-7000-8000-00000000dead' };
  expect((await scenario.post('/v1/qms/risks', f.quality.session, ghostOwner)).status).toBe(422);
  const id = created(await scenario.post('/v1/qms/risks', f.quality.session, risk));
  const list = qmsRiskListResponseSchema.parse(
    (await scenario.get('/v1/qms/risks', f.auditor.session)).body,
  );
  expect(list.data.find((item) => item.id === id)).toMatchObject({
    score: 20,
    level: 'critical',
    review_due: true,
    owner: { id: f.worker.id },
  });
  const lower = { ...risk, probability: 2, impact: 2 };
  const patch = await scenario.patch(`/v1/qms/risks/${id}`, f.quality.session, lower, 1);
  expect(patch.status).toBe(204);
  const stored = await scenario.inTenant((tx) => tx.qmsRisk.findFirstOrThrow({ where: { id } }));
  expect(stored).toMatchObject({ score: 4, level: 'low' });
  expect(stored.code).toMatch(/^RSG-/);
});

it('otra empresa no ve ni cambia los riesgos', async () => {
  const f = await qualityFixture(scenario, 'riesgos-ajenos');
  const risk = await riskBody(f.quality.id);
  const id = created(await scenario.post('/v1/qms/risks', f.quality.session, risk));
  const stranger = await scenario.person('riesgo-ajeno', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = qmsRiskListResponseSchema.parse(
    (await scenario.get('/v1/qms/risks', stranger.session)).body,
  );
  expect(theirs.data.map((item) => item.id)).not.toContain(id);
  const patch = await scenario.patch(`/v1/qms/risks/${id}`, stranger.session, risk, 1);
  expect(patch.status).toBe(404);
});

it('las lecciones las lee todo el personal y solo Calidad las registra', async () => {
  const f = await qualityFixture(scenario, 'lecciones');
  const nc = await reported(scenario, f.worker);
  const lesson = {
    title: 'Revisar antes de enviar',
    context: 'Un informe salió sin revisión.',
    lesson: 'Todo informe al cliente lleva revisión de un par.',
    nonconformity_id: nc,
  };
  expect((await scenario.post('/v1/qms/lessons', f.worker.session, lesson)).status).toBe(403);
  const id = created(await scenario.post('/v1/qms/lessons', f.quality.session, lesson));
  const lessons = lessonListResponseSchema.parse(
    (await scenario.get('/v1/qms/lessons', f.worker.session)).body,
  );
  expect(lessons.data.find((item) => item.id === id)).toMatchObject({
    nonconformity: { id: nc },
    recorded_by: { id: f.quality.id },
  });
  const edited = { ...lesson, title: 'Revisar siempre antes de enviar' };
  expect((await scenario.patch(`/v1/qms/lessons/${id}`, f.quality.session, edited, 1)).status).toBe(
    204,
  );
  const ghost = { ...lesson, nonconformity_id: '01900000-0000-7000-8000-00000000dead' };
  expect((await scenario.post('/v1/qms/lessons', f.quality.session, ghost)).status).toBe(422);
  const stranger = await scenario.person('leccion-ajena', ['COLABORADOR'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = lessonListResponseSchema.parse(
    (await scenario.get('/v1/qms/lessons', stranger.session)).body,
  );
  expect(theirs.data.map((item) => item.id)).not.toContain(id);
});

it('Calidad elige responsables entre las cuentas activas; un colaborador no ve la lista', async () => {
  const f = await qualityFixture(scenario, 'personas');
  const people = qmsRefListResponseSchema.parse(
    (await scenario.get('/v1/qms/people', f.quality.session)).body,
  );
  expect(people.data.map((person) => person.id)).toEqual(
    expect.arrayContaining([f.worker.id, f.verifier.id]),
  );
  expect((await scenario.get('/v1/qms/people', f.worker.session)).status).toBe(403);
});
