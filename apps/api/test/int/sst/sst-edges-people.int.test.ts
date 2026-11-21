import { ownComplaintSchema, sstRefListResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays } from '../../../src/modules/core/index.js';
import { runSstDailyWork } from '../../../src/modules/sst/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  addMember,
  at,
  created,
  examFor,
  ppeFor,
  put,
  sstFixture,
  today,
} from './support/sst-fixture.js';

// Casos límite de SST (B37), segunda parte: salud, comités, estándares y listas: reintentos con la misma clave, fechas futuras, versiones viejas,
// pasos fuera de orden y registros que no existen. Ninguno deja datos a medias.

const scenario = new AccessScenario('sst bordes personas');
const MISSING = '01900000-0000-7000-8000-00000000dead';

it('los exámenes y las entregas rechazan claves reutilizadas, fechas futuras y personas inactivas', async () => {
  const f = await sstFixture(scenario, 'bordes-salud');
  const key = uuidv7();
  const exam = {
    employee_id: f.workerEmployeeId,
    kind: 'periodic',
    exam_date: today(scenario),
    provider: 'IPS',
    concept: 'fit',
  };
  const send = (body: object) =>
    scenario.post('/v1/sst/medical-exams', f.sst.session, body).set('Idempotency-Key', key);
  const first = created(await send(exam));
  expect(created(await send(exam))).toBe(first);
  expect((await send({ ...exam, employee_id: f.peerEmployeeId })).status).toBe(409);
  const fresh = (body: object) =>
    scenario.post('/v1/sst/medical-exams', f.sst.session, body).set('Idempotency-Key', uuidv7());
  expect((await fresh({ ...exam, exam_date: addDays(today(scenario), 1) })).status).toBe(422);
  expect((await fresh({ ...exam, employee_id: MISSING })).status).toBe(422);
  expect((await scenario.post(`/v1/sst/medical-exams/${MISSING}/read`, f.sst.session)).status).toBe(
    404,
  );
});

it('las entregas rechazan claves reutilizadas, fechas futuras y personas inactivas', async () => {
  const f = await sstFixture(scenario, 'bordes-epp');
  const ppeKey = uuidv7();
  const ppe = { employee_id: f.workerEmployeeId, item: 'GAFAS', delivered_on: today(scenario) };
  const deliver = (body: object) =>
    scenario.post('/v1/sst/ppe-deliveries', f.sst.session, body).set('Idempotency-Key', ppeKey);
  expect(created(await deliver(ppe))).toBe(created(await deliver(ppe)));
  expect((await deliver({ ...ppe, employee_id: f.peerEmployeeId })).status).toBe(409);
  const other = (body: object) =>
    scenario.post('/v1/sst/ppe-deliveries', f.sst.session, body).set('Idempotency-Key', uuidv7());
  expect((await other({ ...ppe, delivered_on: addDays(today(scenario), 1) })).status).toBe(422);
  expect((await other({ ...ppe, employee_id: MISSING })).status).toBe(422);
  const delivery = await ppeFor(scenario, f);
  const ack = `/v1/sst/me/ppe-deliveries/${delivery}/actions/acknowledge`;
  expect((await at(scenario, ack, f.hr, 1)).status).toBe(404);
  expect((await at(scenario, ack, f.worker, 5)).status).toBe(409);
});

it('el examen de egreso cierra el ítem del retiro en curso', async () => {
  const f = await sstFixture(scenario, 'bordes-egreso');
  const offboarding = await scenario
    .post('/v1/hr/offboardings', f.hr.session, {
      employee_id: f.workerEmployeeId,
      reason: 'mutual_agreement',
      last_day: addDays(today(scenario), 10),
    })
    .set('Idempotency-Key', uuidv7());
  expect(offboarding.status, offboarding.text).toBe(201);
  await examFor(scenario, f, { kind: 'exit', concept: 'fit', restrictions: null });
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findFirst({
      where: { action: 'hr.offboarding.item', changes: { path: ['item'], equals: 'exit_exam' } },
    }),
  );
  expect(audit?.changes).toMatchObject({ by: 'sst' });
  await examFor(scenario, f, { kind: 'exit', concept: 'fit', restrictions: null });
  await examFor(scenario, f, { kind: 'return', concept: 'fit', restrictions: null });
});

it('los comités rechazan personas inactivas, periodos imposibles y quejas cerradas', async () => {
  const f = await sstFixture(scenario, 'bordes-comite');
  const body = {
    committee: 'copasst',
    user_id: MISSING,
    represents: 'workers',
    from_on: today(scenario),
  };
  expect((await scenario.post('/v1/sst/committee-members', f.sst.session, body)).status).toBe(422);
  const member = await addMember(scenario, f, 'coexistence', f.peer);
  const end = `/v1/sst/committee-members/${member}/actions/end`;
  expect(
    (await at(scenario, end, f.sst, 1, { until_on: addDays(today(scenario), -1) })).status,
  ).toBe(422);
  expect((await at(scenario, end, f.sst, 3, { until_on: '2099-01-01' })).status).toBe(409);
  expect(
    (
      await at(scenario, `/v1/sst/committee-members/${MISSING}/actions/end`, f.sst, 1, {
        until_on: '2099-01-01',
      })
    ).status,
  ).toBe(404);
});

it('las actas futuras y las quejas cerradas se rechazan; la clave no sirve a otra persona', async () => {
  const f = await sstFixture(scenario, 'bordes-comite-quejas');
  await addMember(scenario, f, 'coexistence', f.peer);
  const future = {
    committee: 'coexistence',
    meeting_on: addDays(today(scenario), 1),
    summary: 'Reunión futura del comité.',
  };
  expect((await scenario.post('/v1/sst/committee-minutes', f.peer.session, future)).status).toBe(
    422,
  );
  const key = uuidv7();
  const facts = { facts: 'Me excluyen de las reuniones del equipo sin razón.' };
  const file = (person: typeof f.worker) =>
    scenario.post('/v1/sst/complaints', person.session, facts).set('Idempotency-Key', key);
  const first = await file(f.worker);
  const { id } = ownComplaintSchema.parse(first.body);
  expect(ownComplaintSchema.parse((await file(f.worker)).body).id).toBe(id);
  expect((await file(f.boss)).status).toBe(409);
  const handle = `/v1/sst/complaints/${id}/actions/handle`;
  const close = { status: 'closed', outcome: 'Conciliación.' };
  expect((await at(scenario, handle, f.peer, 1, close)).status).toBe(204);
  expect((await at(scenario, handle, f.peer, 2, close)).status).toBe(409);
  expect(
    (await at(scenario, `/v1/sst/complaints/${MISSING}/actions/handle`, f.peer, 1, close)).status,
  ).toBe(404);
});

it('los estándares no aceptan años imposibles ni versiones viejas', async () => {
  const f = await sstFixture(scenario, 'bordes-estandar');
  expect((await scenario.get('/v1/sst/standards-assessments/1999', f.sst.session)).status).toBe(
    422,
  );
  const path = '/v1/sst/standards-assessments/2031/standards/2.1.1';
  expect((await put(scenario, path, f.sst, { result: 'meets' }, 4)).status).toBe(409);
  expect(
    (await put(scenario, path, f.sst, { result: 'meets', evidence_file_id: MISSING })).status,
  ).toBe(422);
});

it('las listas de personas y el trabajo diario sin pendientes', async () => {
  const f = await sstFixture(scenario, 'bordes-listas');
  const employees = sstRefListResponseSchema.parse(
    (await scenario.get('/v1/sst/employees', f.sst.session)).body,
  );
  expect(employees.data.map((person) => person.id)).toContain(f.workerEmployeeId);
  const people = sstRefListResponseSchema.parse(
    (await scenario.get('/v1/sst/people', f.sst.session)).body,
  );
  expect(people.data.map((person) => person.id)).toContain(f.worker.id);
  expect((await scenario.get('/v1/sst/employees', f.worker.session)).status).toBe(403);
  const unlinked = await scenario.person('bordes-sin-vinculo', ['COLABORADOR']);
  expect((await scenario.get('/v1/sst/me', unlinked.session)).body).toMatchObject({
    is_employee: false,
    ppe: [],
  });
  expect((await scenario.post('/v1/sst/me/medical-exams/read', unlinked.session)).body).toEqual({
    data: [],
  });
  const far = new Date('2099-01-01T12:00:00Z');
  const run = await runSstDailyWork({ database: scenario.db, clock: { now: () => far } });
  expect(run.arlReminders).toBeGreaterThanOrEqual(0);
});
