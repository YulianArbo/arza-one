import { hrCreatedResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays, bogotaToday, fromCalendarDate } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { availableFile, staffFixture, weekdayAfter } from './support/people-fixture.js';

// Casos límite de las reglas del B36: cada tipo de ausencia llega a nómina con su concepto, fechas
// sin días hábiles, reintentos, decisiones fuera de turno, horas extras fuera de plazo y los
// controles del retiro (fecha, duplicado, anulación, entrevista y ítems ajenos).

const scenario = new AccessScenario('casos límite de talento humano');
const MISSING = '01900000-0000-7000-8000-00000000dead';

function at(person: Person, path: string, version: number, body: object = {}) {
  return scenario.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

function register(person: Person, body: object, key = uuidv7()) {
  return scenario.post('/v1/hr/leave-requests', person.session, body).set('Idempotency-Key', key);
}

/** El sábado siguiente a hoy. */
function nextSaturday(): string {
  let date = addDays(bogotaToday(scenario.clock.now()), 1);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 6) date = addDays(date, 1);
  return date;
}

it('cada tipo de ausencia llega a nómina con su concepto', async () => {
  const staff = await staffFixture(scenario, 'conceptos');
  const cases = [
    ['PERMISO_NO_PAGO', 'LICENCIA_NO_PAGA', 20],
    ['LUTO', 'LICENCIA_REMUNERADA', 25],
    ['VACACIONES', 'VACACIONES', 30],
  ] as const;
  for (const [type, concept, days] of cases) {
    const starts = weekdayAfter(scenario, days);
    const body = { employee_id: staff.workerEmployeeId, type, starts_on: starts, ends_on: starts };
    const created = await register(staff.hr, body);
    expect(created.status, created.text).toBe(201);
    const { id } = hrCreatedResponseSchema.parse(created.body);
    const novelty = await scenario.inTenant((tx) =>
      tx.hrPayrollNovelty.findFirstOrThrow({ where: { sourceId: id } }),
    );
    expect(novelty.concept).toBe(concept);
  }
});

it('el registro de Talento humano exige soporte disponible, colaborador activo y no se duplica', async () => {
  const staff = await staffFixture(scenario, 'registro');
  const starts = weekdayAfter(scenario, 40);
  const body = {
    employee_id: staff.workerEmployeeId,
    type: 'CALAMIDAD',
    starts_on: starts,
    ends_on: starts,
  };
  expect((await register(staff.hr, { ...body, support_file_id: uuidv7() })).status).toBe(422);
  expect((await register(staff.hr, { ...body, employee_id: MISSING })).status).toBe(404);
  expect((await register(staff.hr, { ...body, type: 'NO_EXISTE' })).status).toBe(422);
  const key = uuidv7();
  const support = await availableFile(scenario, staff.hr);
  const first = await register(staff.hr, { ...body, support_file_id: support }, key);
  const { id } = hrCreatedResponseSchema.parse(first.body);
  expect(hrCreatedResponseSchema.parse((await register(staff.hr, body, key)).body).id).toBe(id);
  expect((await register(staff.hr, { ...body, ends_on: addDays(starts, 1) }, key)).status).toBe(
    409,
  );
  expect((await register(staff.hr, body)).status).toBe(422);
});

it('no acepta una ausencia sin días hábiles ni decide fuera de turno', async () => {
  const staff = await staffFixture(scenario, 'turnos');
  const saturday = nextSaturday();
  const weekend = await scenario
    .post('/v1/hr/me/leave-requests', staff.worker.session, {
      type: 'VACACIONES',
      starts_on: saturday,
      ends_on: addDays(saturday, 1),
    })
    .set('Idempotency-Key', uuidv7());
  expect(weekend.status).toBe(422);
  const starts = weekdayAfter(scenario, 45);
  const created = await scenario
    .post('/v1/hr/me/leave-requests', staff.worker.session, {
      type: 'LUTO',
      starts_on: starts,
      ends_on: starts,
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const path = `/v1/hr/leave-requests/${id}/actions`;
  expect((await at(staff.boss, `/v1/hr/leave-requests/${MISSING}/actions/approve`, 1)).status).toBe(
    404,
  );
  expect((await at(staff.boss, `${path}/approve`, 4)).status).toBe(409);
  expect((await at(staff.boss, `${path}/reject`, 1, { note: 'Sin reemplazo' })).status).toBe(204);
  expect((await at(staff.boss, `${path}/approve`, 2)).status).toBe(409);
});

it('las horas extras no se autorizan ni se reportan fuera de plazo', async () => {
  const staff = await staffFixture(scenario, 'extras-plazo');
  const later = weekdayAfter(scenario, 3);
  const created = await scenario
    .post('/v1/hr/overtime', staff.worker.session, {
      work_date: later,
      kind: 'day',
      hours: 1,
      reason: 'Cierre',
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const path = `/v1/hr/overtime/${id}/actions`;
  expect((await at(staff.boss, `/v1/hr/overtime/${MISSING}/actions/authorize`, 1)).status).toBe(
    404,
  );
  expect((await at(staff.peer, `${path}/cancel`, 1)).status).toBe(404);
  expect((await at(staff.boss, `${path}/authorize`, 1)).status).toBe(204);
  expect((await at(staff.worker, `${path}/report`, 2, { hours: 1 })).status).toBe(422);
  expect((await at(staff.worker, `${path}/cancel`, 2)).status).toBe(409);
  const past = await scenario
    .post('/v1/hr/overtime', staff.worker.session, {
      work_date: later,
      kind: 'night',
      hours: 1,
      reason: 'Soporte',
    })
    .set('Idempotency-Key', uuidv7());
  const pastId = hrCreatedResponseSchema.parse(past.body).id;
  await scenario.inTenant((tx) =>
    tx.hrOvertime.update({
      where: { id: pastId },
      data: { workDate: fromCalendarDate(addDays(bogotaToday(scenario.clock.now()), -2)) },
    }),
  );
  expect((await at(staff.boss, `/v1/hr/overtime/${pastId}/actions/authorize`, 2)).status).toBe(422);
});

function startOffboarding(person: Person, body: object, key = uuidv7()) {
  return scenario.post('/v1/hr/offboardings', person.session, body).set('Idempotency-Key', key);
}

it('el retiro valida la fecha, no se duplica y se puede anular y volver a registrar', async () => {
  const staff = await staffFixture(scenario, 'retiro-reglas');
  const base = { employee_id: staff.workerEmployeeId, reason: 'resignation' };
  const tooEarly = { ...base, last_day: addDays(bogotaToday(scenario.clock.now()), -400) };
  expect((await startOffboarding(staff.hr, tooEarly)).status).toBe(422);
  const body = { ...base, last_day: weekdayAfter(scenario, 20) };
  const key = uuidv7();
  const { id } = hrCreatedResponseSchema.parse((await startOffboarding(staff.hr, body, key)).body);
  expect(hrCreatedResponseSchema.parse((await startOffboarding(staff.hr, body, key)).body).id).toBe(
    id,
  );
  const reused = { ...body, employee_id: staff.peerEmployeeId };
  expect((await startOffboarding(staff.hr, reused, key)).status).toBe(409);
  expect((await startOffboarding(staff.hr, body)).status).toBe(409);
  expect(
    (await at(staff.hr, `/v1/hr/offboardings/${id}/actions/cancel`, 1, { reason: 'Se queda' }))
      .status,
  ).toBe(204);
  expect((await at(staff.hr, `/v1/hr/offboardings/${id}/actions/clear`, 2)).status).toBe(409);
  expect((await startOffboarding(staff.hr, body)).status).toBe(201);
});

it('la entrevista de retiro guarda su soporte; un ítem ya hecho no se repite', async () => {
  const staff = await staffFixture(scenario, 'retiro-items');
  const body = {
    employee_id: staff.workerEmployeeId,
    reason: 'contract_end',
    last_day: weekdayAfter(scenario, 15),
  };
  const { id } = hrCreatedResponseSchema.parse((await startOffboarding(staff.hr, body)).body);
  const item = (person: Person, name: string, version: number, extra: object = {}) =>
    at(person, `/v1/hr/offboardings/${id}/items/${name}/actions/complete`, version, {
      done_on: bogotaToday(scenario.clock.now()),
      ...extra,
    });
  expect((await item(staff.hr, 'exit_interview', 1, { file_id: uuidv7() })).status).toBe(422);
  const file = await availableFile(scenario, staff.hr);
  expect((await item(staff.hr, 'exit_interview', 1, { file_id: file })).status).toBe(204);
  expect((await item(staff.hr, 'exit_interview', 2)).status).toBe(409);
  expect(
    (await item(staff.hr, 'settlement', 2, { done_on: weekdayAfter(scenario, 4) })).status,
  ).toBe(422);
  const stored = await scenario.inTenant((tx) =>
    tx.hrOffboarding.findFirstOrThrow({ where: { id } }),
  );
  expect(stored.exitInterviewRecordId).toBe(file);
  expect(
    (await at(staff.hr, `/v1/hr/offboardings/${MISSING}/actions/cancel`, 1, { reason: 'Nada' }))
      .status,
  ).toBe(404);
});
