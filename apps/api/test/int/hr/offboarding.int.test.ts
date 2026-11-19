import {
  hrCreatedResponseSchema,
  myTaskListResponseSchema,
  offboardingListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { runHrDailyWork } from '../../../src/modules/hr/index.js';
import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { staffFixture, type Staff } from './support/people-fixture.js';

// Retiro y paz y salvo (B36, criterio del bloque: «el retiro revoca accesos y lista activos por
// devolver»; numeral 15.1). Si el último día ya pasó, la cuenta se desactiva en el acto; si no, lo
// hace el trabajo diario cuando termina ese día.

const scenario = new AccessScenario('retiro del colaborador');

function start(person: Person, body: object) {
  return scenario
    .post('/v1/hr/offboardings', person.session, body)
    .set('Idempotency-Key', uuidv7());
}

function complete(person: Person, id: string, item: string, version: number, body: object = {}) {
  return scenario
    .post(`/v1/hr/offboardings/${id}/items/${item}/actions/complete`, person.session, {
      done_on: bogotaToday(scenario.clock.now()),
      ...body,
    })
    .set('If-Match', `"${String(version)}"`);
}

async function giveAsset(holder: Person): Promise<string> {
  const tenantId = scenario.tenant.id;
  return scenario.inTenant(async (tx) => {
    const asset = await tx.astAsset.create({
      data: {
        tenantId,
        code: `ACT-2026-${String(Date.now()).slice(-7)}`,
        name: 'Portátil de prueba',
        category: 'computer',
        purchaseDate: new Date('2026-01-10T00:00:00Z'),
        cost: '3000000',
        usefulLifeMonths: 36,
        status: 'assigned',
        requestKey: uuidv7(),
      },
    });
    await tx.astAssignment.create({
      data: {
        tenantId,
        assetId: asset.id,
        userId: holder.id,
        signerPartyId: uuidv7(),
        assignedOn: new Date('2026-02-01T00:00:00Z'),
        signBy: new Date('2026-02-05T00:00:00Z'),
        assignedBy: holder.id,
        status: 'active',
        contractDocumentId: uuidv7(),
        envelopeId: uuidv7(),
        activatedAt: new Date('2026-02-03T00:00:00Z'),
        requestKey: uuidv7(),
      },
    });
    return asset.id;
  });
}

it('con el último día ya pasado revoca el acceso en el acto y lista los activos por devolver', async () => {
  const staff = await staffFixture(scenario, 'retiro');
  await giveAsset(staff.worker);
  const lastDay = addDays(bogotaToday(scenario.clock.now()), -1);
  const body = { employee_id: staff.workerEmployeeId, reason: 'resignation', last_day: lastDay };
  expect((await start(staff.boss, body)).status).toBe(403);
  const created = await start(staff.hr, body);
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const after = await scenario.inTenant(async (tx) => ({
    user: await tx.user.findUniqueOrThrow({ where: { id: staff.worker.id } }),
    open: await tx.session.count({ where: { userId: staff.worker.id, revokedAt: null } }),
    employee: await tx.hrEmployee.findUniqueOrThrow({ where: { id: staff.workerEmployeeId } }),
    novelty: await tx.hrPayrollNovelty.findFirst({ where: { sourceId: id, concept: 'RETIRO' } }),
    event: await tx.outboxEvent.count({ where: { eventType: 'employee.terminated' } }),
  }));
  expect(after.user.status).toBe('inactive');
  expect(after.open).toBe(0);
  expect(after.employee.status).toBe('terminated');
  expect(after.novelty).not.toBeNull();
  expect(after.event).toBeGreaterThan(0);
  expect((await scenario.get('/v1/hr/me', staff.worker.session)).status).toBe(401);
  const list = offboardingListResponseSchema.parse(
    (await scenario.get('/v1/hr/offboardings', staff.hr.session)).body,
  );
  const view = list.data.find((row) => row.id === id);
  expect(view?.assets.map((asset) => asset.name)).toEqual(['Portátil de prueba']);
  expect(view?.can_clear).toBe(false);
  expect((await complete(staff.hr, id, 'assets_return', view?.version ?? 0)).status).toBe(409);
  const cancel = scenario
    .post(`/v1/hr/offboardings/${id}/actions/cancel`, staff.hr.session, { reason: 'Error' })
    .set('If-Match', `"${String(view?.version ?? 0)}"`);
  expect((await cancel).status).toBe(409);
});

const ITEMS = [
  'assets_return',
  'finance_clearance',
  'exit_exam',
  'settlement',
  'exit_interview',
  'certificate',
];

/** Talento humano marca todos los ítems; devuelve la versión con que queda el retiro. */
async function completeAll(staff: Staff, id: string): Promise<number> {
  let version = 1;
  for (const item of ITEMS) {
    const done = await complete(staff.hr, id, item, version);
    expect(done.status, `${item}: ${done.text}`).toBe(204);
    version += 1;
  }
  return version;
}

/** El trabajo diario como si ya hubiera pasado el último día, sin mover el reloj de las sesiones. */
async function runDailyWorkDaysLater(days: number) {
  const later = new Date(scenario.clock.now().getTime() + days * 24 * 60 * 60 * 1000);
  return runHrDailyWork({ database: scenario.db, clock: { now: () => later } });
}

it('el responsable ve su ítem; un compañero no lo puede marcar', async () => {
  const staff = await staffFixture(scenario, 'retiro-tareas');
  const created = await start(staff.hr, {
    employee_id: staff.workerEmployeeId,
    reason: 'mutual_agreement',
    last_day: addDays(bogotaToday(scenario.clock.now()), 5),
  });
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const user = await scenario.inTenant((tx) =>
    tx.user.findUniqueOrThrow({ where: { id: staff.worker.id } }),
  );
  expect(user.status).not.toBe('inactive');
  const tasks = myTaskListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/tasks', staff.hr.session)).body,
  );
  expect(tasks.data.filter((task) => task.id === id).map((task) => task.item)).toEqual(
    expect.arrayContaining(['settlement', 'exit_interview', 'certificate']),
  );
  expect((await complete(staff.peer, id, 'settlement', 1)).status).toBe(404);
});

it('con la lista completa y el último día cumplido se emite el paz y salvo', async () => {
  const staff = await staffFixture(scenario, 'paz-y-salvo');
  const created = await start(staff.hr, {
    employee_id: staff.workerEmployeeId,
    reason: 'mutual_agreement',
    last_day: addDays(bogotaToday(scenario.clock.now()), 5),
  });
  const { id } = hrCreatedResponseSchema.parse(created.body);
  let version = await completeAll(staff, id);
  const clear = () =>
    scenario
      .post(`/v1/hr/offboardings/${id}/actions/clear`, staff.hr.session)
      .set('If-Match', `"${String(version)}"`);
  expect((await clear()).status).toBe(409);
  expect((await runDailyWorkDaysLater(7)).accountsClosed).toBeGreaterThanOrEqual(1);
  version += 1;
  expect((await clear()).status).toBe(204);
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({ where: { entityId: id }, select: { action: true } }),
  );
  expect(audit.map(({ action }) => action)).toEqual(
    expect.arrayContaining([
      'hr.offboarding.start',
      'hr.offboarding.terminate',
      'hr.offboarding.clear',
    ]),
  );
});

it('otra empresa no ve los retiros', async () => {
  const staff = await staffFixture(scenario, 'retiro-aislado');
  await start(staff.hr, {
    employee_id: staff.workerEmployeeId,
    reason: 'contract_end',
    last_day: addDays(bogotaToday(scenario.clock.now()), 10),
  });
  const stranger = await scenario.person('retiro-ajeno', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get('/v1/hr/offboardings', stranger.session)).body).toEqual({ data: [] });
});
