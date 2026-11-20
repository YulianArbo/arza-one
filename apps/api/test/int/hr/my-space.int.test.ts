import {
  hrCreatedResponseSchema,
  leaveTypeListResponseSchema,
  myTaskListResponseSchema,
  mySpaceResponseSchema,
  noveltyConceptListResponseSchema,
  overtimeListResponseSchema,
  teamResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { bogotaToday, fromCalendarDate } from '../../../src/modules/core/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { staffFixture, weekdayAfter } from './support/people-fixture.js';

// «Mi espacio» y «Mi equipo» (B36): lo propio de cada persona, el equipo directo del jefe, las
// listas de selección, las tareas a cargo y las horas extras que pide Talento humano a nombre de otro.

const scenario = new AccessScenario('mi espacio y mi equipo');

it('muestra los datos propios, el jefe y el equipo con su saldo', async () => {
  const staff = await staffFixture(scenario, 'mi-espacio');
  const mine = mySpaceResponseSchema.parse(
    (await scenario.get('/v1/hr/me', staff.worker.session)).body,
  );
  expect(mine.employment).toMatchObject({
    salary_band_label: 'Banda 2',
    contract_available: true,
    has_team: false,
    manager: { id: staff.boss.id },
  });
  const boss = mySpaceResponseSchema.parse(
    (await scenario.get('/v1/hr/me', staff.boss.session)).body,
  );
  expect(boss.employment?.has_team).toBe(true);
  const team = teamResponseSchema.parse(
    (await scenario.get('/v1/hr/me/team', staff.boss.session)).body,
  );
  expect(team.data.map((member) => member.employee_id).sort()).toEqual(
    [staff.workerEmployeeId, staff.peerEmployeeId].sort(),
  );
  expect((await scenario.get('/v1/hr/me/team', staff.worker.session)).body).toEqual({ data: [] });
  const outsider = await scenario.person('mi-espacio-sin-ficha', ['COLABORADOR']);
  expect((await scenario.get('/v1/hr/me', outsider.session)).body).toEqual({ employment: null });
  for (const path of [
    'leave-requests',
    'overtime',
    'novelties',
    'performance-reviews',
    'trainings',
  ]) {
    expect((await scenario.get(`/v1/hr/me/${path}`, outsider.session)).body).toEqual({ data: [] });
  }
  const own = await scenario.post('/v1/hr/me/disciplinary-cases/read', outsider.session);
  expect(own.body).toEqual({ data: [] });
});

it('ofrece las listas de tipos de ausencia y de conceptos', async () => {
  const staff = await staffFixture(scenario, 'listas');
  const types = leaveTypeListResponseSchema.parse(
    (await scenario.get('/v1/hr/leave-types', staff.worker.session)).body,
  );
  expect(types.data.find((type) => type.code === 'INCAPACIDAD')?.hr_only).toBe(true);
  const concepts = noveltyConceptListResponseSchema.parse(
    (await scenario.get('/v1/hr/payroll-novelties/concepts', staff.hr.session)).body,
  );
  expect(concepts.data.find((concept) => concept.code === 'RETIRO')?.automatic).toBe(true);
  expect(
    (await scenario.get('/v1/hr/payroll-novelties/concepts', staff.worker.session)).status,
  ).toBe(403);
});

it('el responsable marca su tarea de inducción; otro no puede', async () => {
  const staff = await staffFixture(scenario, 'tareas');
  const today = bogotaToday(scenario.clock.now());
  const task = await scenario.inTenant((tx) =>
    tx.hrOnboardingTask.create({
      data: {
        tenantId: scenario.tenant.id,
        employeeId: staff.workerEmployeeId,
        kind: 'job_training',
        task: 'Entrenamiento en el cargo',
        responsibleId: staff.boss.id,
        dueOn: fromCalendarDate(today),
      },
    }),
  );
  const list = myTaskListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/tasks', staff.boss.session)).body,
  );
  expect(list.data.map((item) => item.id)).toContain(task.id);
  const path = `/v1/hr/me/tasks/onboarding/${task.id}/actions/complete`;
  const done = (session: typeof staff.boss.session, body: object, version = 1) =>
    scenario.post(path, session, body).set('If-Match', `"${String(version)}"`);
  expect((await done(staff.peer.session, { done_on: today })).status).toBe(404);
  expect((await done(staff.boss.session, { done_on: weekdayAfter(scenario, 5) })).status).toBe(422);
  expect((await done(staff.boss.session, { done_on: today }, 7)).status).toBe(409);
  expect((await done(staff.boss.session, { done_on: today })).status).toBe(204);
  expect((await done(staff.boss.session, { done_on: today }, 2)).status).toBe(409);
});

it('Talento humano pide horas extras a nombre de otro; un compañero no puede', async () => {
  const staff = await staffFixture(scenario, 'extras-th');
  const body = {
    employee_id: staff.workerEmployeeId,
    work_date: weekdayAfter(scenario, 2),
    kind: 'holiday_day',
    hours: 1,
    reason: 'Inventario',
  };
  const ask = (session: typeof staff.hr.session, payload: object, key = uuidv7()) =>
    scenario.post('/v1/hr/overtime', session, payload).set('Idempotency-Key', key);
  expect((await ask(staff.peer.session, body)).status).toBe(403);
  const key = uuidv7();
  const created = await ask(staff.hr.session, body, key);
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  expect(hrCreatedResponseSchema.parse((await ask(staff.hr.session, body, key)).body).id).toBe(id);
  expect((await ask(staff.hr.session, { ...body, hours: 2 }, key)).status).toBe(409);
  const own = await ask(staff.worker.session, {
    ...body,
    employee_id: staff.workerEmployeeId,
    hours: 0.5,
  });
  expect(own.status).toBe(201);
  const all = overtimeListResponseSchema.parse(
    (await scenario.get('/v1/hr/overtime?status=requested', staff.hr.session)).body,
  );
  expect(all.data.find((item) => item.id === id)?.can_decide).toBe(false);
  expect((await scenario.get('/v1/hr/overtime', staff.boss.session)).status).toBe(403);
  const outsider = await scenario.person('extras-sin-ficha', ['COLABORADOR']);
  expect((await ask(outsider.session, { ...body, employee_id: undefined })).status).toBe(404);
});
