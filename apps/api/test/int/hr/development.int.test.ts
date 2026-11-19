import {
  hrCreatedResponseSchema,
  performanceReviewListResponseSchema,
  trainingListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { availableFile, staffFixture, type Staff } from './support/people-fixture.js';

// Desempeño y formación (B36, decisión 7): quién fija y califica, el promedio ponderado, la
// aceptación del colaborador, la asistencia a una formación, el permiso negado, los reintentos y
// el aislamiento entre empresas.

const scenario = new AccessScenario('desempeño y formación');
const OBJECTIVES = [
  { title: 'Entregar a tiempo', weight: 60 },
  { title: 'Documentar', weight: 40 },
];

function versioned(person: Person, path: string, version: number, body: object = {}) {
  return scenario.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

function createReview(person: Person, body: object, key = uuidv7()) {
  return scenario
    .post('/v1/hr/performance-reviews', person.session, body)
    .set('Idempotency-Key', key);
}

async function reviewFor(staff: Staff, period: string): Promise<string> {
  const body = { employee_id: staff.workerEmployeeId, period, objectives: OBJECTIVES };
  const created = await createReview(staff.boss, body);
  expect(created.status, created.text).toBe(201);
  return hrCreatedResponseSchema.parse(created.body).id;
}

it('el jefe fija y califica; el colaborador acepta con la nota ponderada', async () => {
  const staff = await staffFixture(scenario, 'desempeno');
  const body = { employee_id: staff.workerEmployeeId, period: '2026', objectives: OBJECTIVES };
  expect((await createReview(staff.peer, body)).status).toBe(403);
  expect((await createReview(staff.worker, body)).status).toBe(403);
  const key = uuidv7();
  const created = await createReview(staff.boss, body, key);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  expect(hrCreatedResponseSchema.parse((await createReview(staff.boss, body, key)).body).id).toBe(
    id,
  );
  expect((await createReview(staff.boss, { ...body, period: '2027' }, key)).status).toBe(409);
  expect((await createReview(staff.hr, body)).status).toBe(409);
  const score = `/v1/hr/performance-reviews/${id}/actions/score`;
  const agree = `/v1/hr/performance-reviews/${id}/actions/agree`;
  expect((await versioned(staff.worker, agree, 1)).status).toBe(409);
  expect((await versioned(staff.boss, score, 1, { scores: [5], comment: 'Bien' })).status).toBe(
    422,
  );
  expect((await versioned(staff.peer, score, 1, { scores: [5, 3], comment: 'Bien' })).status).toBe(
    403,
  );
  expect(
    (await versioned(staff.boss, score, 1, { scores: [5, 3], comment: 'Buen año' })).status,
  ).toBe(204);
  expect((await versioned(staff.boss, score, 2, { scores: [5, 3], comment: 'Otra' })).status).toBe(
    409,
  );
  expect((await versioned(staff.peer, agree, 2)).status).toBe(404);
  expect((await versioned(staff.worker, agree, 2, { comment: 'De acuerdo' })).status).toBe(204);
  const mine = performanceReviewListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/performance-reviews', staff.worker.session)).body,
  );
  expect(mine.data[0]).toMatchObject({ score: '4.20', status: 'agreed', can_agree: false });
});

it('Talento humano ve todas; el jefe ve las de su equipo; otra empresa ninguna', async () => {
  const staff = await staffFixture(scenario, 'desempeno-listas');
  const id = await reviewFor(staff, '2026-S1');
  const all = performanceReviewListResponseSchema.parse(
    (await scenario.get('/v1/hr/performance-reviews', staff.hr.session)).body,
  );
  expect(all.data.find((review) => review.id === id)?.can_score).toBe(true);
  const team = performanceReviewListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/team/performance-reviews', staff.boss.session)).body,
  );
  expect(team.data.map((review) => review.id)).toContain(id);
  expect((await scenario.get('/v1/hr/performance-reviews', staff.boss.session)).status).toBe(403);
  const stranger = await scenario.person('desempeno-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  const foreign = await scenario.get('/v1/hr/performance-reviews', stranger.session);
  expect(foreign.body).toEqual({ data: [] });
  const missing = '01900000-0000-7000-8000-00000000dead';
  const score = `/v1/hr/performance-reviews/${missing}/actions/score`;
  expect((await versioned(staff.boss, score, 1, { scores: [3], comment: 'Bien' })).status).toBe(
    404,
  );
});

function training(person: Person, body: object, key = uuidv7()) {
  return scenario.post('/v1/hr/trainings', person.session, body).set('Idempotency-Key', key);
}

it('programa, registra la asistencia y el colaborador ve su formación', async () => {
  const staff = await staffFixture(scenario, 'formacion');
  const today = bogotaToday(scenario.clock.now());
  const body = {
    title: 'Seguridad de la información',
    kind: 'training',
    scheduled_on: today,
    hours: 2,
    employee_ids: [staff.workerEmployeeId],
  };
  expect((await training(staff.boss, body)).status).toBe(403);
  expect((await training(staff.hr, { ...body, employee_ids: [uuidv7()] })).status).toBe(422);
  const key = uuidv7();
  const { id } = hrCreatedResponseSchema.parse((await training(staff.hr, body, key)).body);
  expect(hrCreatedResponseSchema.parse((await training(staff.hr, body, key)).body).id).toBe(id);
  expect((await training(staff.hr, { ...body, title: 'Otra cosa' }, key)).status).toBe(409);
  const path = `/v1/hr/trainings/${id}/actions/attendance`;
  const outsider = { attendance: [{ employee_id: staff.peerEmployeeId, attended: true }] };
  expect((await versioned(staff.hr, path, 1, outsider)).status).toBe(422);
  const badFile = { ...outsider, evidence_file_id: uuidv7() };
  expect((await versioned(staff.hr, path, 1, badFile)).status).toBe(422);
  const attendance = {
    evidence_file_id: await availableFile(scenario, staff.hr),
    attendance: [{ employee_id: staff.workerEmployeeId, attended: true, evaluation: 5 }],
  };
  expect((await versioned(staff.hr, path, 1, attendance)).status).toBe(204);
  expect((await versioned(staff.hr, path, 2, attendance)).status).toBe(409);
  const mine = trainingListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/trainings', staff.worker.session)).body,
  );
  expect(mine.data[0]).toMatchObject({
    status: 'held',
    attendees: [{ attended: true, evaluation: 5 }],
  });
  const peers = await scenario.get('/v1/hr/me/trainings', staff.peer.session);
  expect(peers.body).toEqual({ data: [] });
});

it('no registra asistencia antes de la fecha y cancela con motivo', async () => {
  const staff = await staffFixture(scenario, 'formacion-cancelar');
  const body = {
    title: 'Pausas activas',
    kind: 'wellbeing',
    scheduled_on: addDays(bogotaToday(scenario.clock.now()), 10),
    hours: 1,
    employee_ids: [staff.workerEmployeeId, staff.peerEmployeeId],
  };
  const { id } = hrCreatedResponseSchema.parse((await training(staff.hr, body)).body);
  const early = { attendance: [{ employee_id: staff.workerEmployeeId, attended: true }] };
  const attendance = `/v1/hr/trainings/${id}/actions/attendance`;
  expect((await versioned(staff.hr, attendance, 1, early)).status).toBe(422);
  const cancel = `/v1/hr/trainings/${id}/actions/cancel`;
  expect((await versioned(staff.hr, cancel, 1, { reason: 'Sin cupo' })).status).toBe(204);
  expect((await versioned(staff.hr, cancel, 2, { reason: 'Otra vez' })).status).toBe(409);
  const list = trainingListResponseSchema.parse(
    (await scenario.get('/v1/hr/trainings', staff.hr.session)).body,
  );
  expect(list.data.find((row) => row.id === id)).toMatchObject({ status: 'cancelled' });
  const stranger = await scenario.person('formacion-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get('/v1/hr/trainings', stranger.session)).body).toEqual({ data: [] });
  const missing = '01900000-0000-7000-8000-00000000dead';
  expect(
    (
      await versioned(staff.hr, `/v1/hr/trainings/${missing}/actions/cancel`, 1, {
        reason: 'Sin motivo real',
      })
    ).status,
  ).toBe(404);
});
