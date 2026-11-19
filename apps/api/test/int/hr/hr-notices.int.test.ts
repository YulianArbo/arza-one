import { hrCreatedResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { publishTenantEvents } from '../../../src/modules/ntf/application/publisher.js';
import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { staffFixture, weekdayAfter, type Staff } from './support/people-fixture.js';

// Avisos del B36 de punta a punta: cada acción deja su evento en la bandeja de salida y, al
// publicarse, la persona correcta recibe su aviso; quien hace la acción no se avisa a sí mismo y
// la citación no lleva el contenido del caso.

const scenario = new AccessScenario('avisos de talento humano');

function at(person: Person, path: string, version: number, body: object = {}) {
  return scenario.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

function created(response: { body: unknown }): string {
  return hrCreatedResponseSchema.parse(response.body).id;
}

async function publish(): Promise<void> {
  await seedNotificationTemplates(apiDatabase(), [scenario.tenant.id], scenario.clock);
  await publishTenantEvents(
    { database: apiDatabase(), clock: scenario.clock },
    scenario.tenant.id,
    scenario.clock.now(),
  );
}

async function noticesOf(person: Person, kind: string) {
  return scenario.inTenant((tx) =>
    tx.notification.findMany({ where: { userId: person.id, kind } }),
  );
}

async function leaveAndOvertime(staff: Staff): Promise<void> {
  const starts = weekdayAfter(scenario, 25);
  const leave = created(
    await scenario
      .post('/v1/hr/me/leave-requests', staff.worker.session, {
        type: 'LUTO',
        starts_on: starts,
        ends_on: starts,
      })
      .set('Idempotency-Key', uuidv7()),
  );
  await at(staff.boss, `/v1/hr/leave-requests/${leave}/actions/approve`, 1);
  const overtime = created(
    await scenario
      .post('/v1/hr/overtime', staff.worker.session, {
        work_date: weekdayAfter(scenario, 2),
        kind: 'night',
        hours: 1,
        reason: 'Despliegue',
      })
      .set('Idempotency-Key', uuidv7()),
  );
  await at(staff.boss, `/v1/hr/overtime/${overtime}/actions/reject`, 1, { note: 'No aplica' });
}

it('el jefe recibe las solicitudes y el colaborador las respuestas', async () => {
  const staff = await staffFixture(scenario, 'avisos-ausencias');
  await leaveAndOvertime(staff);
  await publish();
  const toBoss = await noticesOf(staff.boss, 'hr_leave_update');
  expect(toBoss.map((notice) => notice.link)).toContain('/app/mi-espacio/equipo');
  expect((await noticesOf(staff.boss, 'hr_overtime_update')).length).toBeGreaterThan(0);
  const toWorker = await noticesOf(staff.worker, 'hr_leave_update');
  expect(toWorker.map((notice) => notice.title).join(' ')).toContain('aprobada');
  const rejected = await noticesOf(staff.worker, 'hr_overtime_update');
  expect(rejected.map((notice) => notice.title).join(' ')).toContain('no fueron autorizadas');
  expect(await noticesOf(staff.worker, 'hr_offboarding_task')).toEqual([]);
});

/** Evaluación fijada y calificada por el jefe: el colaborador debe recibir el aviso. */
async function scoredReview(staff: Staff): Promise<void> {
  const review = created(
    await scenario
      .post('/v1/hr/performance-reviews', staff.boss.session, {
        employee_id: staff.workerEmployeeId,
        period: '2026',
        objectives: [{ title: 'Entregar a tiempo', weight: 100 }],
      })
      .set('Idempotency-Key', uuidv7()),
  );
  const score = { scores: [4], comment: 'Buen trabajo.' };
  await at(staff.boss, `/v1/hr/performance-reviews/${review}/actions/score`, 1, score);
}

it('avisa la evaluación lista, la citación sin contenido y las tareas del retiro', async () => {
  const staff = await staffFixture(scenario, 'avisos-otros');
  const finance = await scenario.person('avisos-financiero', ['ADMIN_FINANCIERO']);
  await scoredReview(staff);
  const facts = 'Incumplió el horario cinco veces en el mes, según el control de acceso.';
  const caseId = created(
    await scenario
      .post('/v1/hr/disciplinary-cases', staff.hr.session, {
        employee_id: staff.workerEmployeeId,
        facts,
      })
      .set('Idempotency-Key', uuidv7()),
  );
  const hearing = { hearing_on: weekdayAfter(scenario, 12) };
  await at(staff.hr, `/v1/hr/disciplinary-cases/${caseId}/actions/cite`, 1, hearing);
  await scenario
    .post('/v1/hr/offboardings', staff.hr.session, {
      employee_id: staff.peerEmployeeId,
      reason: 'resignation',
      last_day: weekdayAfter(scenario, 20),
    })
    .set('Idempotency-Key', uuidv7());
  await publish();
  expect((await noticesOf(staff.worker, 'hr_review_update')).length).toBe(1);
  const citation = await noticesOf(staff.worker, 'hr_disciplinary_notice');
  expect(citation).toHaveLength(1);
  expect(JSON.stringify(citation)).not.toContain('horario');
  const tasks = await noticesOf(finance, 'hr_offboarding_task');
  expect(tasks.length).toBeGreaterThanOrEqual(1);
  expect(await noticesOf(staff.hr, 'hr_offboarding_task')).toEqual([]);
});
