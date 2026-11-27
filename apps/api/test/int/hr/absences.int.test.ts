import {
  hrCreatedResponseSchema,
  leaveRequestListResponseSchema,
  mySpaceResponseSchema,
  overtimeListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { staffFixture, weekdayAfter } from './support/people-fixture.js';

// Permisos, vacaciones y horas extras (B36, ficha 17.13): el colaborador ve su saldo y solicita, su
// jefe aprueba y la novedad llega al mes de nómina. Prueba también el permiso negado (un compañero
// no decide), el aislamiento entre empresas y la auditoría.

const scenario = new AccessScenario('ausencias y horas extras');

function requestLeave(person: Person, body: object) {
  return scenario
    .post('/v1/hr/me/leave-requests', person.session, body)
    .set('Idempotency-Key', uuidv7());
}

function act(person: Person, path: string, version: number, body: object = {}) {
  return scenario.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

it('el colaborador solicita vacaciones, su jefe las aprueba y llegan a nómina', async () => {
  const staff = await staffFixture(scenario, 'vacaciones');
  const space = mySpaceResponseSchema.parse(
    (await scenario.get('/v1/hr/me', staff.worker.session)).body,
  );
  expect(space.employment?.vacation.available).toBe('15.04');
  expect(space.employment?.manager?.id).toBe(staff.boss.id);
  const starts = weekdayAfter(scenario, 20);
  const created = await requestLeave(staff.worker, {
    type: 'VACACIONES',
    starts_on: starts,
    ends_on: addDays(starts, 6),
  });
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const team = leaveRequestListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/team/leave-requests', staff.boss.session)).body,
  );
  expect(team.data.map((leave) => [leave.id, leave.can_decide])).toEqual([[id, true]]);
  const path = `/v1/hr/leave-requests/${id}/actions/approve`;
  expect((await act(staff.peer, path, 1)).status).toBe(403);
  expect((await act(staff.worker, path, 1)).status).toBe(403);
  expect((await act(staff.boss, path, 1)).status).toBe(204);
  const effects = await scenario.inTenant(async (tx) => ({
    novelties: await tx.hrPayrollNovelty.findMany({ where: { sourceId: id } }),
    // El reloj de la prueba no avanza: el orden lo da la cadena de la auditoría (seq), no la hora.
    audit: await tx.auditEvent.findMany({ where: { entityId: id }, orderBy: { seq: 'asc' } }),
    events: await tx.outboxEvent.count({ where: { eventType: { startsWith: 'hr.leave.' } } }),
  }));
  expect(effects.novelties.map((n) => n.concept)).toContain('VACACIONES');
  expect(effects.novelties.reduce((sum, n) => sum + Number(n.quantity), 0)).toBeGreaterThan(0);
  expect(effects.audit.map((event) => event.action)).toEqual([
    'hr.leave.request',
    'hr.leave.approve',
  ]);
  expect(effects.events).toBeGreaterThanOrEqual(2);
});

it('no deja pedir más vacaciones que el saldo ni cruzar fechas; el colaborador puede retirarla', async () => {
  const staff = await staffFixture(scenario, 'saldo');
  const starts = weekdayAfter(scenario, 30);
  const tooLong = await requestLeave(staff.worker, {
    type: 'VACACIONES',
    starts_on: starts,
    ends_on: addDays(starts, 40),
  });
  expect(tooLong.status).toBe(422);
  const sick = await requestLeave(staff.worker, {
    type: 'INCAPACIDAD',
    starts_on: starts,
    ends_on: starts,
  });
  expect(sick.status).toBe(422);
  const past = await requestLeave(staff.worker, {
    type: 'PERMISO_REMUNERADO',
    starts_on: addDays(bogotaToday(scenario.clock.now()), -2),
    ends_on: addDays(bogotaToday(scenario.clock.now()), -2),
  });
  expect(past.status).toBe(422);
  const ok = await requestLeave(staff.worker, { type: 'LUTO', starts_on: starts, ends_on: starts });
  const { id } = hrCreatedResponseSchema.parse(ok.body);
  const overlap = await requestLeave(staff.worker, {
    type: 'CALAMIDAD',
    starts_on: starts,
    ends_on: starts,
  });
  expect(overlap.status).toBe(422);
  const cancel = `/v1/hr/me/leave-requests/${id}/actions/cancel`;
  expect((await act(staff.peer, cancel, 1)).status).toBe(404);
  expect((await act(staff.worker, cancel, 1)).status).toBe(204);
  expect((await act(staff.worker, cancel, 2)).status).toBe(409);
});

it('Talento humano registra la incapacidad aprobada; otra empresa no la ve ni la decide', async () => {
  const staff = await staffFixture(scenario, 'incapacidad');
  const stranger = await scenario.person('incapacidad-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  const today = bogotaToday(scenario.clock.now());
  const body = {
    employee_id: staff.workerEmployeeId,
    type: 'INCAPACIDAD',
    starts_on: today,
    ends_on: addDays(today, 2),
  };
  const denied = await scenario
    .post('/v1/hr/leave-requests', staff.worker.session, body)
    .set('Idempotency-Key', uuidv7());
  expect(denied.status).toBe(403);
  const created = await scenario
    .post('/v1/hr/leave-requests', staff.hr.session, body)
    .set('Idempotency-Key', uuidv7());
  expect(created.status, created.text).toBe(201);
  const all = leaveRequestListResponseSchema.parse(
    (await scenario.get('/v1/hr/leave-requests?status=approved', staff.hr.session)).body,
  );
  expect(all.data.find((leave) => leave.type === 'INCAPACIDAD')?.days).toBe(3);
  const foreign = await scenario.get('/v1/hr/leave-requests', stranger.session);
  expect(foreign.body).toEqual({ data: [] });
  const workerList = await scenario.get('/v1/hr/leave-requests', staff.worker.session);
  expect(workerList.status).toBe(403);
});

/** Lo reportado se ve en «Mi espacio», llega a nómina y queda auditado. */
async function expectReported(worker: Person, id: string): Promise<void> {
  const staff = { worker };
  const mine = overtimeListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/overtime', staff.worker.session)).body,
  );
  expect(mine.data[0]).toMatchObject({ status: 'reported', reported_hours: 1.5 });
  const novelty = await scenario.inTenant((tx) =>
    tx.hrPayrollNovelty.findFirstOrThrow({ where: { sourceId: id } }),
  );
  expect([novelty.concept, novelty.quantity.toFixed(2)]).toEqual(['HE_NOCTURNA', '1.50']);
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({ where: { entityId: id }, select: { action: true } }),
  );
  expect(audit.map(({ action }) => action).sort()).toEqual([
    'hr.overtime.authorize',
    'hr.overtime.report',
    'hr.overtime.request',
  ]);
}

it('las horas extras se autorizan antes, respetan los topes y lo reportado llega a nómina', async () => {
  const staff = await staffFixture(scenario, 'extras');
  const day = bogotaToday(scenario.clock.now());
  const ask = (hours: number) =>
    scenario
      .post('/v1/hr/overtime', staff.worker.session, {
        work_date: day,
        kind: 'night',
        hours,
        reason: 'Despliegue nocturno',
      })
      .set('Idempotency-Key', uuidv7());
  expect((await ask(3)).status).toBe(422);
  const created = await ask(2);
  expect(created.status, created.text).toBe(201);
  expect((await ask(0.5)).status).toBe(422);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const authorize = `/v1/hr/overtime/${id}/actions/authorize`;
  expect((await act(staff.peer, authorize, 1)).status).toBe(403);
  expect((await act(staff.boss, authorize, 1)).status).toBe(204);
  const report = `/v1/hr/overtime/${id}/actions/report`;
  expect((await act(staff.worker, report, 2, { hours: 3 })).status).toBe(422);
  expect((await act(staff.peer, report, 2, { hours: 1 })).status).toBe(404);
  expect((await act(staff.worker, report, 2, { hours: 1.5 })).status).toBe(204);
  await expectReported(staff.worker, id);
});

it('no autoriza un día que ya pasó y la persona puede retirar su solicitud', async () => {
  const staff = await staffFixture(scenario, 'extras-retiro');
  const day = weekdayAfter(scenario, 3);
  const created = await scenario
    .post('/v1/hr/overtime', staff.worker.session, {
      work_date: day,
      kind: 'day',
      hours: 1,
      reason: 'Cierre de mes',
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const reject = `/v1/hr/overtime/${id}/actions/reject`;
  expect((await act(staff.boss, reject, 1, {})).status).toBe(422);
  expect((await act(staff.worker, `/v1/hr/overtime/${id}/actions/cancel`, 1)).status).toBe(204);
  expect((await act(staff.boss, reject, 2, { note: 'No aplica' })).status).toBe(409);
  const yesterday = addDays(bogotaToday(scenario.clock.now()), -1);
  const late = await scenario
    .post('/v1/hr/overtime', staff.worker.session, {
      work_date: yesterday,
      kind: 'day',
      hours: 1,
      reason: 'Tarde',
    })
    .set('Idempotency-Key', uuidv7());
  expect(late.status).toBe(422);
});
