import {
  hrCreatedResponseSchema,
  noveltyListResponseSchema,
  payrollPeriodDetailResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { staffFixture } from './support/people-fixture.js';

// Novedades de nómina por mes (B36, decisión 6): las manuales, el cierre (que no se reabre ni
// admite cambios, ni siquiera directo en la base) y el archivo para el software de nómina.

const scenario = new AccessScenario('novedades de nómina');

/** Un mes pasado y distinto en cada prueba, para no chocar con otros cierres. */
function pastMonth(monthsBack: number): string {
  const [year = 0, month = 0] = bogotaToday(scenario.clock.now()).split('-').map(Number);
  const index = year * 12 + (month - 1) - monthsBack;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function register(person: Person, body: object) {
  return scenario
    .post('/v1/hr/payroll-novelties', person.session, body)
    .set('Idempotency-Key', uuidv7());
}

/** El mes cerrado se descarga como CSV seguro y el cierre y la descarga quedan auditados. */
async function expectClosedMonth(hr: Person, director: Person, period: string): Promise<void> {
  const exportPath = `/v1/hr/payroll-novelties/periods/${period}/export`;
  const staff = { hr };
  const file = await scenario.post(exportPath, director.session);
  expect(file.status).toBe(200);
  expect(file.headers['content-type']).toContain('text/csv');
  expect(file.text).toContain('BONIFICACION;Bonificación;1,00;Unidades;250000,50');
  expect(file.text).toContain("'=Bono");
  const detail = payrollPeriodDetailResponseSchema.parse(
    (await scenario.get(`/v1/hr/payroll-novelties/periods/${period}`, staff.hr.session)).body,
  );
  expect(detail.period).toMatchObject({ status: 'closed', novelties: 1 });
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({
      where: { action: { in: ['hr.payroll_period.close', 'hr.payroll_period.export'] } },
      select: { action: true, changes: true },
    }),
  );
  expect(audit.filter(({ changes }) => JSON.stringify(changes).includes(period))).toHaveLength(2);
}

it('registra, cierra el mes y descarga el archivo; cerrado ya no cambia', async () => {
  const staff = await staffFixture(scenario, 'nomina');
  const director = await scenario.person('nomina-direccion', ['DIRECCION']);
  const period = pastMonth(2);
  const body = {
    period,
    employee_id: staff.workerEmployeeId,
    concept: 'BONIFICACION',
    quantity: '1',
    unit: 'units',
    amount: '250000.50',
    note: '=Bono',
  };
  expect((await register(staff.worker, body)).status).toBe(403);
  expect((await register(staff.hr, { ...body, concept: 'VACACIONES' })).status).toBe(422);
  const created = await register(staff.hr, body);
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const exportPath = `/v1/hr/payroll-novelties/periods/${period}/export`;
  expect((await scenario.post(exportPath, director.session)).status).toBe(409);
  const close = (person: Person) =>
    scenario.post('/v1/hr/payroll-novelties/close-period', person.session, {
      period,
      confirm: true,
    });
  expect((await close(staff.worker)).status).toBe(403);
  expect((await close(director)).status).toBe(204);
  expect((await close(staff.hr)).status).toBe(409);
  expect((await register(staff.hr, body)).status).toBe(409);
  const withdraw = scenario
    .post(`/v1/hr/payroll-novelties/${id}/actions/withdraw`, staff.hr.session)
    .set('If-Match', '"1"');
  expect((await withdraw).status).toBe(409);
  await expectClosedMonth(staff.hr, director, period);
});

it('la base de datos no deja escribir en un mes cerrado ni reabrirlo', async () => {
  const staff = await staffFixture(scenario, 'nomina-base');
  const period = pastMonth(5);
  const close = await scenario.post('/v1/hr/payroll-novelties/close-period', staff.hr.session, {
    period,
    confirm: true,
  });
  expect(close.status).toBe(204);
  const insert = scenario.inTenant((tx) =>
    tx.hrPayrollNovelty.create({
      data: {
        tenantId: scenario.tenant.id,
        period,
        employeeId: staff.workerEmployeeId,
        concept: 'OTRO',
        quantity: '1',
        unit: 'units',
        sourceEntity: 'manual',
        requestKey: uuidv7(),
      },
    }),
  );
  await expect(insert).rejects.toThrow();
  const reopen = scenario.inTenant((tx) =>
    tx.hrPayrollPeriod.updateMany({
      where: { period },
      data: { status: 'open', closedAt: null, closedBy: null },
    }),
  );
  await expect(reopen).rejects.toThrow();
});

it('una novedad automática de un mes cerrado va al siguiente; el colaborador ve las suyas', async () => {
  const staff = await staffFixture(scenario, 'nomina-tarde');
  const today = bogotaToday(scenario.clock.now());
  const thisMonth = today.slice(0, 7);
  const lastMonth = pastMonth(1);
  await scenario.post('/v1/hr/payroll-novelties/close-period', staff.hr.session, {
    period: lastMonth,
    confirm: true,
  });
  const lateDay = `${lastMonth}-15`;
  const leave = await scenario
    .post('/v1/hr/leave-requests', staff.hr.session, {
      employee_id: staff.workerEmployeeId,
      type: 'INCAPACIDAD',
      starts_on: lateDay,
      ends_on: lateDay,
    })
    .set('Idempotency-Key', uuidv7());
  expect(leave.status, leave.text).toBe(201);
  const mine = noveltyListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/novelties', staff.worker.session)).body,
  );
  expect(mine.data.map((n) => [n.period, n.concept])).toContainEqual([thisMonth, 'INCAPACIDAD']);
  const peers = noveltyListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/novelties', staff.peer.session)).body,
  );
  expect(peers.data).toEqual([]);
  const future = addDays(today, 70).slice(0, 7);
  const early = await scenario.post('/v1/hr/payroll-novelties/close-period', staff.hr.session, {
    period: future,
    confirm: true,
  });
  expect(early.status).toBe(409);
});

it('otra empresa no ve los meses ni las novedades', async () => {
  await staffFixture(scenario, 'nomina-aislada');
  const stranger = await scenario.person('nomina-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  const detail = payrollPeriodDetailResponseSchema.parse(
    (await scenario.get(`/v1/hr/payroll-novelties/periods/${pastMonth(2)}`, stranger.session)).body,
  );
  expect(detail.data).toEqual([]);
});

it('una novedad repetida con la misma clave no se duplica y se retira del mes abierto', async () => {
  const staff = await staffFixture(scenario, 'nomina-reintento');
  const body = {
    period: pastMonth(8),
    employee_id: staff.workerEmployeeId,
    concept: 'AUXILIO',
    quantity: '2',
    unit: 'units',
  };
  const key = uuidv7();
  const send = (payload: object) =>
    scenario
      .post('/v1/hr/payroll-novelties', staff.hr.session, payload)
      .set('Idempotency-Key', key);
  const { id } = hrCreatedResponseSchema.parse((await send(body)).body);
  expect(hrCreatedResponseSchema.parse((await send(body)).body).id).toBe(id);
  expect((await send({ ...body, quantity: '3' })).status).toBe(409);
  const withdraw = (target: string, version: number) =>
    scenario
      .post(`/v1/hr/payroll-novelties/${target}/actions/withdraw`, staff.hr.session)
      .set('If-Match', `"${String(version)}"`);
  expect((await withdraw('01900000-0000-7000-8000-00000000dead', 1)).status).toBe(404);
  expect((await withdraw(id, 5)).status).toBe(409);
  expect((await withdraw(id, 1)).status).toBe(204);
});

it('no acepta conceptos desconocidos ni retira novedades automáticas', async () => {
  const staff = await staffFixture(scenario, 'nomina-automatica');
  const body = {
    period: pastMonth(9),
    employee_id: staff.workerEmployeeId,
    concept: 'AUXILIO',
    quantity: '2',
    unit: 'units',
  };
  const withdraw = (target: string, version: number) =>
    scenario
      .post(`/v1/hr/payroll-novelties/${target}/actions/withdraw`, staff.hr.session)
      .set('If-Match', `"${String(version)}"`);
  const unknown = await scenario
    .post('/v1/hr/payroll-novelties', staff.hr.session, { ...body, concept: 'NO_EXISTE' })
    .set('Idempotency-Key', uuidv7());
  expect(unknown.status).toBe(422);
  const automatic = await scenario.inTenant((tx) =>
    tx.hrPayrollNovelty.create({
      data: {
        tenantId: scenario.tenant.id,
        period: body.period,
        employeeId: staff.workerEmployeeId,
        concept: 'RETIRO',
        quantity: '1',
        unit: 'units',
        sourceEntity: 'offboarding',
        sourceId: uuidv7(),
      },
    }),
  );
  expect((await withdraw(automatic.id, 1)).status).toBe(409);
  const bad = await scenario.get('/v1/hr/payroll-novelties/periods/2026-99', staff.hr.session);
  expect(bad.status).toBe(422);
});
