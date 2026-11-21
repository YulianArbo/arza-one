import {
  medicalExamListResponseSchema,
  medicalExamSchema,
  myMedicalExamsSchema,
  mySstSchema,
  ppeDeliveryListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays } from '../../../src/modules/core/index.js';
import { runSstDailyWork } from '../../../src/modules/sst/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { at, examFor, ppeFor, sstFixture, today } from './support/sst-fixture.js';

// Evaluaciones médicas y elementos de protección (B37, decisiones 7, 12 y 13): solo el concepto de
// aptitud y las restricciones, cifradas y con cada consulta en la auditoría; las ven SST y la
// propia persona. El examen de ingreso cierra la tarea de inducción de Talento humano.

const scenario = new AccessScenario('sst salud');
const RESTRICTIONS = 'Evitar levantar más de 10 kilos.';

it('guarda las restricciones cifradas y registra cada consulta', async () => {
  const f = await sstFixture(scenario, 'examen');
  const id = await examFor(scenario, f, { next_due_on: addDays(today(scenario), 20) });
  const stored = await scenario.inTenant((tx) =>
    tx.sstMedicalExam.findFirstOrThrow({ where: { id } }),
  );
  expect(stored.restrictionsEncrypted).not.toContain('kilos');
  const list = medicalExamListResponseSchema.parse(
    (await scenario.get('/v1/sst/medical-exams', f.sst.session)).body,
  );
  const row = list.data.find((exam) => exam.id === id);
  expect(row).toMatchObject({ has_restrictions: true, due_soon: true });
  expect(row).not.toHaveProperty('restrictions');
  const read = await scenario.post(`/v1/sst/medical-exams/${id}/read`, f.sst.session);
  expect(medicalExamSchema.parse(read.body).restrictions).toBe(RESTRICTIONS);
  const own = myMedicalExamsSchema.parse(
    (await scenario.post('/v1/sst/me/medical-exams/read', f.worker.session)).body,
  );
  expect(own.data[0]).toMatchObject({ id, restrictions: RESTRICTIONS });
  const reads = await scenario.inTenant((tx) =>
    tx.auditEvent.groupBy({
      by: ['action'],
      where: { entityId: id, action: { startsWith: 'sst.medical.read' } },
      _count: true,
    }),
  );
  expect(reads.map((entry) => entry.action).sort()).toEqual([
    'sst.medical.read',
    'sst.medical.read_own',
  ]);
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findFirstOrThrow({ where: { entityId: id, action: 'sst.medical.record' } }),
  );
  expect(JSON.stringify(audit.changes)).not.toContain('kilos');
});

it('ni Talento humano, ni el jefe, ni otra empresa ven los conceptos de aptitud', async () => {
  const f = await sstFixture(scenario, 'examen-acceso');
  const id = await examFor(scenario, f);
  expect((await scenario.get('/v1/sst/medical-exams', f.hr.session)).status).toBe(403);
  expect((await scenario.post(`/v1/sst/medical-exams/${id}/read`, f.boss.session)).status).toBe(
    403,
  );
  const body = {
    employee_id: f.workerEmployeeId,
    kind: 'periodic',
    exam_date: today(scenario),
    provider: 'IPS',
    concept: 'fit',
  };
  const denied = await scenario
    .post('/v1/sst/medical-exams', f.hr.session, body)
    .set('Idempotency-Key', uuidv7());
  expect(denied.status).toBe(403);
  const peer = myMedicalExamsSchema.parse(
    (await scenario.post('/v1/sst/me/medical-exams/read', f.peer.session)).body,
  );
  expect(peer.data).toEqual([]);
  const stranger = await scenario.person('salud-ajena', ['SST'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.post(`/v1/sst/medical-exams/${id}/read`, stranger.session)).status).toBe(
    404,
  );
});

it('el examen de ingreso da por hecha la tarea de inducción de Talento humano', async () => {
  const f = await sstFixture(scenario, 'examen-ingreso');
  const task = await scenario.inTenant((tx) =>
    tx.hrOnboardingTask.create({
      data: {
        tenantId: scenario.tenant.id,
        employeeId: f.workerEmployeeId,
        kind: 'medical_exam',
        task: 'Evaluación médica de ingreso',
        responsibleId: f.sst.id,
        dueOn: new Date(`${today(scenario)}T00:00:00Z`),
      },
    }),
  );
  await examFor(scenario, f, { kind: 'entry', concept: 'fit', restrictions: null });
  const done = await scenario.inTenant((tx) =>
    tx.hrOnboardingTask.findFirstOrThrow({ where: { id: task.id } }),
  );
  expect(done.doneOn?.toISOString().slice(0, 10)).toBe(today(scenario));
  expect(done.doneBy).toBe(f.sst.id);
});

it('avisa una sola vez de las evaluaciones que vencen en 30 días', async () => {
  const f = await sstFixture(scenario, 'examen-vence');
  const id = await examFor(scenario, f, { next_due_on: addDays(today(scenario), 10) });
  const run = () => runSstDailyWork({ database: scenario.db, clock: scenario.clock });
  expect((await run()).examNotices).toBeGreaterThanOrEqual(1);
  await run();
  const notices = await scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: { eventType: 'sst.exam.due', payload: { path: ['exam_id'], equals: id } },
    }),
  );
  expect(notices).toBe(1);
});

it('SST entrega un elemento y solo el colaborador confirma que lo recibió', async () => {
  const f = await sstFixture(scenario, 'epp');
  const bad = { employee_id: f.workerEmployeeId, item: 'NO_EXISTE', delivered_on: today(scenario) };
  const invalid = await scenario
    .post('/v1/sst/ppe-deliveries', f.sst.session, bad)
    .set('Idempotency-Key', uuidv7());
  expect(invalid.status).toBe(422);
  const forbidden = await scenario
    .post('/v1/sst/ppe-deliveries', f.hr.session, { ...bad, item: 'GAFAS' })
    .set('Idempotency-Key', uuidv7());
  expect(forbidden.status).toBe(403);
  const id = await ppeFor(scenario, f);
  const path = `/v1/sst/me/ppe-deliveries/${id}/actions/acknowledge`;
  expect((await at(scenario, path, f.peer, 1)).status).toBe(404);
  expect((await at(scenario, path, f.worker, 1)).status).toBe(204);
  expect((await at(scenario, path, f.worker, 2)).status).toBe(409);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  expect(mine.ppe[0]).toMatchObject({ id, item_label: 'Reposapiés' });
  expect(mine.ppe[0]?.acknowledged_at).not.toBeNull();
  const list = ppeDeliveryListResponseSchema.parse(
    (await scenario.get('/v1/sst/ppe-deliveries', f.hr.session)).body,
  );
  expect(list.data.map((delivery) => delivery.id)).toContain(id);
});
