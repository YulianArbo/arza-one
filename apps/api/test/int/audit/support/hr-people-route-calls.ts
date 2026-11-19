import { hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { addDays, bogotaToday, fromCalendarDate } from '../../../../src/modules/core/index.js';
import {
  availableFile,
  staffFixture,
  weekdayAfter,
  type Staff,
} from '../../hr/support/people-fixture.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Rutas de desempeño, formación, disciplinario, retiro y tareas del B36 para el recorrido de
// auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const FACTS = 'Incumplió el horario cinco veces en el mes, según el control de acceso.';
const OBJECTIVES = [{ title: 'Entregar a tiempo', weight: 100 }];

function final(test: request.Test): PendingRequest {
  return { test };
}

function at(s: AccessScenario, path: string, person: Person, version: number, body: object = {}) {
  return s.post(path, person.session, body).set('If-Match', `"${String(version)}"`);
}

function created(response: request.Response): string {
  return hrCreatedResponseSchema.parse(response.body).id;
}

async function staffOf(s: AccessScenario, label: string): Promise<Staff> {
  return staffFixture(s, `auditoria-${label}-${uuidv7().slice(-6)}`);
}

async function review(s: AccessScenario, staff: Staff): Promise<string> {
  const body = {
    employee_id: staff.workerEmployeeId,
    period: uuidv7().slice(-8),
    objectives: OBJECTIVES,
  };
  return created(
    await s
      .post('/v1/hr/performance-reviews', staff.hr.session, body)
      .set('Idempotency-Key', uuidv7()),
  );
}

async function training(s: AccessScenario, staff: Staff): Promise<string> {
  const body = {
    title: 'Inducción en seguridad de la información',
    kind: 'training',
    scheduled_on: bogotaToday(s.clock.now()),
    hours: 2,
    employee_ids: [staff.workerEmployeeId],
  };
  return created(
    await s.post('/v1/hr/trainings', staff.hr.session, body).set('Idempotency-Key', uuidv7()),
  );
}

async function openCase(s: AccessScenario, staff: Staff): Promise<string> {
  const body = { employee_id: staff.workerEmployeeId, facts: FACTS };
  return created(
    await s
      .post('/v1/hr/disciplinary-cases', staff.hr.session, body)
      .set('Idempotency-Key', uuidv7()),
  );
}

/** Caso citado con la diligencia ayer, listo para los descargos. */
async function citedYesterday(s: AccessScenario, staff: Staff): Promise<string> {
  const id = await openCase(s, staff);
  const yesterday = addDays(bogotaToday(s.clock.now()), -1);
  await s.inTenant((tx) =>
    tx.hrDisciplinaryCase.update({
      where: { id },
      data: {
        status: 'cited',
        openedOn: fromCalendarDate(addDays(yesterday, -8)),
        citedOn: fromCalendarDate(addDays(yesterday, -7)),
        hearingOn: fromCalendarDate(yesterday),
      },
    }),
  );
  return id;
}

async function offboarding(s: AccessScenario, staff: Staff, lastDay: string): Promise<string> {
  const body = { employee_id: staff.workerEmployeeId, reason: 'resignation', last_day: lastDay };
  return created(
    await s.post('/v1/hr/offboardings', staff.hr.session, body).set('Idempotency-Key', uuidv7()),
  );
}

const ITEMS = [
  'assets_return',
  'finance_clearance',
  'exit_exam',
  'settlement',
  'exit_interview',
  'certificate',
];

export const HR_PEOPLE_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/hr/performance-reviews': async (s) => {
    const staff = await staffOf(s, 'evaluacion');
    const body = { employee_id: staff.workerEmployeeId, period: '2026', objectives: OBJECTIVES };
    return final(
      s
        .post('/v1/hr/performance-reviews', staff.boss.session, body)
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/performance-reviews/{id}/actions/score': async (s) => {
    const staff = await staffOf(s, 'calificar');
    const id = await review(s, staff);
    const body = { scores: [4], comment: 'Cumplió los compromisos.' };
    return final(at(s, `/v1/hr/performance-reviews/${id}/actions/score`, staff.boss, 1, body));
  },
  'POST /v1/hr/performance-reviews/{id}/actions/agree': async (s) => {
    const staff = await staffOf(s, 'aceptar');
    const id = await review(s, staff);
    const score = { scores: [5], comment: 'Superó lo esperado.' };
    await at(s, `/v1/hr/performance-reviews/${id}/actions/score`, staff.boss, 1, score);
    return final(at(s, `/v1/hr/performance-reviews/${id}/actions/agree`, staff.worker, 2, {}));
  },
  'POST /v1/hr/trainings': async (s) => {
    const staff = await staffOf(s, 'formacion');
    const body = {
      title: 'Pausas activas',
      kind: 'wellbeing',
      scheduled_on: weekdayAfter(s, 5),
      hours: 1,
      employee_ids: [staff.workerEmployeeId],
    };
    return final(
      s.post('/v1/hr/trainings', staff.hr.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/trainings/{id}/actions/attendance': async (s) => {
    const staff = await staffOf(s, 'asistencia');
    const id = await training(s, staff);
    const body = {
      attendance: [{ employee_id: staff.workerEmployeeId, attended: true, evaluation: 5 }],
    };
    return final(at(s, `/v1/hr/trainings/${id}/actions/attendance`, staff.hr, 1, body));
  },
  'POST /v1/hr/trainings/{id}/actions/cancel': async (s) => {
    const staff = await staffOf(s, 'cancelar-formacion');
    const id = await training(s, staff);
    return final(
      at(s, `/v1/hr/trainings/${id}/actions/cancel`, staff.hr, 1, { reason: 'Sin cupo' }),
    );
  },
  'POST /v1/hr/disciplinary-cases': async (s) => {
    const staff = await staffOf(s, 'disciplinario');
    const body = { employee_id: staff.workerEmployeeId, facts: FACTS };
    return final(
      s.post('/v1/hr/disciplinary-cases', staff.hr.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/disciplinary-cases/{id}/read': async (s) => {
    const staff = await staffOf(s, 'leer-caso');
    const id = await openCase(s, staff);
    return final(s.post(`/v1/hr/disciplinary-cases/${id}/read`, staff.hr.session));
  },
  'POST /v1/hr/disciplinary-cases/{id}/actions/cite': async (s) => {
    const staff = await staffOf(s, 'citar');
    const id = await openCase(s, staff);
    const body = { hearing_on: weekdayAfter(s, 12) };
    return final(at(s, `/v1/hr/disciplinary-cases/${id}/actions/cite`, staff.hr, 1, body));
  },
  'POST /v1/hr/disciplinary-cases/{id}/actions/hearing': async (s) => {
    const staff = await staffOf(s, 'descargos');
    const id = await citedYesterday(s, staff);
    const body = {
      statement: 'Explica los retrasos.',
      hearing_record_file_id: await availableFile(s, staff.hr),
    };
    return final(at(s, `/v1/hr/disciplinary-cases/${id}/actions/hearing`, staff.hr, 2, body));
  },
  'POST /v1/hr/disciplinary-cases/{id}/actions/decide': async (s) => {
    const staff = await staffOf(s, 'decidir');
    const id = await citedYesterday(s, staff);
    const hearing = {
      statement: 'Explica los retrasos.',
      hearing_record_file_id: await availableFile(s, staff.hr),
    };
    await at(s, `/v1/hr/disciplinary-cases/${id}/actions/hearing`, staff.hr, 2, hearing);
    const body = {
      decision: 'warning',
      reasoning: 'Se comprobaron los hechos y se valoraron los descargos.',
    };
    return final(at(s, `/v1/hr/disciplinary-cases/${id}/actions/decide`, staff.hr, 3, body));
  },
  'POST /v1/hr/me/disciplinary-cases/read': async (s) => {
    const staff = await staffOf(s, 'mi-citacion');
    const id = await openCase(s, staff);
    await at(s, `/v1/hr/disciplinary-cases/${id}/actions/cite`, staff.hr, 1, {
      hearing_on: weekdayAfter(s, 12),
    });
    return final(s.post('/v1/hr/me/disciplinary-cases/read', staff.worker.session));
  },
  'POST /v1/hr/me/tasks/onboarding/{id}/actions/complete': async (s) => {
    const staff = await staffOf(s, 'tarea-induccion');
    const task = await s.inTenant((tx) =>
      tx.hrOnboardingTask.create({
        data: {
          tenantId: s.tenant.id,
          employeeId: staff.workerEmployeeId,
          kind: 'job_training',
          task: 'Entrenamiento en el cargo',
          responsibleId: staff.boss.id,
          dueOn: fromCalendarDate(bogotaToday(s.clock.now())),
        },
      }),
    );
    const body = { done_on: bogotaToday(s.clock.now()) };
    return final(
      at(s, `/v1/hr/me/tasks/onboarding/${task.id}/actions/complete`, staff.boss, 1, body),
    );
  },
  'POST /v1/hr/offboardings': async (s) => {
    const staff = await staffOf(s, 'retiro');
    const body = {
      employee_id: staff.workerEmployeeId,
      reason: 'contract_end',
      last_day: weekdayAfter(s, 10),
    };
    return final(
      s.post('/v1/hr/offboardings', staff.hr.session, body).set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/offboardings/{id}/actions/cancel': async (s) => {
    const staff = await staffOf(s, 'anular-retiro');
    const id = await offboarding(s, staff, weekdayAfter(s, 10));
    return final(
      at(s, `/v1/hr/offboardings/${id}/actions/cancel`, staff.hr, 1, { reason: 'Se queda' }),
    );
  },
  'POST /v1/hr/offboardings/{id}/items/{item}/actions/complete': async (s) => {
    const staff = await staffOf(s, 'item-retiro');
    const id = await offboarding(s, staff, weekdayAfter(s, 10));
    const body = { done_on: bogotaToday(s.clock.now()) };
    return final(
      at(s, `/v1/hr/offboardings/${id}/items/settlement/actions/complete`, staff.hr, 1, body),
    );
  },
  'POST /v1/hr/offboardings/{id}/actions/clear': async (s) => {
    const staff = await staffOf(s, 'paz-y-salvo');
    const id = await offboarding(s, staff, addDays(bogotaToday(s.clock.now()), -1));
    let version = 2;
    for (const item of ITEMS) {
      const body = { done_on: bogotaToday(s.clock.now()) };
      await at(
        s,
        `/v1/hr/offboardings/${id}/items/${item}/actions/complete`,
        staff.hr,
        version,
        body,
      );
      version += 1;
    }
    return final(at(s, `/v1/hr/offboardings/${id}/actions/clear`, staff.hr, version));
  },
};
