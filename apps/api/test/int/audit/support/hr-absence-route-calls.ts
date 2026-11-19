import { hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { addDays, bogotaToday } from '../../../../src/modules/core/index.js';
import { staffFixture, weekdayAfter, type Staff } from '../../hr/support/people-fixture.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Rutas de ausencias, horas extras y novedades de nómina del B36 para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

function versioned(s: AccessScenario, path: string, person: Person, body: object = {}) {
  return s.post(path, person.session, body).set('If-Match', '"1"');
}

async function leave(s: AccessScenario): Promise<{ staff: Staff; id: string }> {
  const staff = await staffFixture(s, `auditoria-ausencia-${uuidv7().slice(-6)}`);
  const starts = weekdayAfter(s, 15);
  const created = await s
    .post('/v1/hr/me/leave-requests', staff.worker.session, {
      type: 'PERMISO_REMUNERADO',
      starts_on: starts,
      ends_on: starts,
    })
    .set('Idempotency-Key', uuidv7());
  return { staff, id: hrCreatedResponseSchema.parse(created.body).id };
}

async function overtime(s: AccessScenario): Promise<{ staff: Staff; id: string }> {
  const staff = await staffFixture(s, `auditoria-extras-${uuidv7().slice(-6)}`);
  const created = await s
    .post('/v1/hr/overtime', staff.worker.session, {
      work_date: bogotaToday(s.clock.now()),
      kind: 'day',
      hours: 1,
      reason: 'Cierre de mes',
    })
    .set('Idempotency-Key', uuidv7());
  return { staff, id: hrCreatedResponseSchema.parse(created.body).id };
}

/** Un mes viejo y distinto en cada llamada: la empresa de prueba es nueva en cada recorrido. */
let monthsUsed = 0;
function oldMonth(): string {
  monthsUsed += 1;
  return `${String(2000 + Math.floor(monthsUsed / 12))}-${String((monthsUsed % 12) + 1).padStart(2, '0')}`;
}

async function manualNovelty(s: AccessScenario, period: string) {
  const staff = await staffFixture(s, `auditoria-novedad-${uuidv7().slice(-6)}`);
  const created = await s
    .post('/v1/hr/payroll-novelties', staff.hr.session, {
      period,
      employee_id: staff.workerEmployeeId,
      concept: 'BONIFICACION',
      quantity: '1',
      unit: 'units',
    })
    .set('Idempotency-Key', uuidv7());
  return { staff, created };
}

export const HR_ABSENCE_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/hr/me/leave-requests': async (s) => {
    const staff = await staffFixture(s, 'auditoria-solicitud');
    const starts = weekdayAfter(s, 20);
    return final(
      s
        .post('/v1/hr/me/leave-requests', staff.worker.session, {
          type: 'LUTO',
          starts_on: starts,
          ends_on: starts,
        })
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/me/leave-requests/{id}/actions/cancel': async (s) => {
    const { staff, id } = await leave(s);
    return final(versioned(s, `/v1/hr/me/leave-requests/${id}/actions/cancel`, staff.worker));
  },
  'POST /v1/hr/leave-requests': async (s) => {
    const staff = await staffFixture(s, 'auditoria-registro');
    const today = bogotaToday(s.clock.now());
    return final(
      s
        .post('/v1/hr/leave-requests', staff.hr.session, {
          employee_id: staff.workerEmployeeId,
          type: 'INCAPACIDAD',
          starts_on: today,
          ends_on: addDays(today, 1),
        })
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/leave-requests/{id}/actions/approve': async (s) => {
    const { staff, id } = await leave(s);
    return final(versioned(s, `/v1/hr/leave-requests/${id}/actions/approve`, staff.boss));
  },
  'POST /v1/hr/leave-requests/{id}/actions/reject': async (s) => {
    const { staff, id } = await leave(s);
    const path = `/v1/hr/leave-requests/${id}/actions/reject`;
    return final(versioned(s, path, staff.boss, { note: 'No es posible en esa fecha' }));
  },
  'POST /v1/hr/overtime': async (s) => {
    const staff = await staffFixture(s, 'auditoria-pedir-extras');
    return final(
      s
        .post('/v1/hr/overtime', staff.worker.session, {
          work_date: weekdayAfter(s, 2),
          kind: 'night',
          hours: 2,
          reason: 'Despliegue',
        })
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/overtime/{id}/actions/authorize': async (s) => {
    const { staff, id } = await overtime(s);
    return final(versioned(s, `/v1/hr/overtime/${id}/actions/authorize`, staff.boss));
  },
  'POST /v1/hr/overtime/{id}/actions/reject': async (s) => {
    const { staff, id } = await overtime(s);
    const path = `/v1/hr/overtime/${id}/actions/reject`;
    return final(versioned(s, path, staff.boss, { note: 'No hace falta' }));
  },
  'POST /v1/hr/overtime/{id}/actions/report': async (s) => {
    const { staff, id } = await overtime(s);
    await versioned(s, `/v1/hr/overtime/${id}/actions/authorize`, staff.boss);
    return final(
      s
        .post(`/v1/hr/overtime/${id}/actions/report`, staff.worker.session, { hours: 1 })
        .set('If-Match', '"2"'),
    );
  },
  'POST /v1/hr/overtime/{id}/actions/cancel': async (s) => {
    const { staff, id } = await overtime(s);
    return final(versioned(s, `/v1/hr/overtime/${id}/actions/cancel`, staff.worker));
  },
  'POST /v1/hr/payroll-novelties': async (s) => {
    const staff = await staffFixture(s, 'auditoria-nueva-novedad');
    return final(
      s
        .post('/v1/hr/payroll-novelties', staff.hr.session, {
          period: oldMonth(),
          employee_id: staff.workerEmployeeId,
          concept: 'AUXILIO',
          quantity: '1',
          unit: 'units',
        })
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/payroll-novelties/{id}/actions/withdraw': async (s) => {
    const { staff, created } = await manualNovelty(s, oldMonth());
    const { id } = hrCreatedResponseSchema.parse(created.body);
    return final(versioned(s, `/v1/hr/payroll-novelties/${id}/actions/withdraw`, staff.hr));
  },
  'POST /v1/hr/payroll-novelties/close-period': async (s) => {
    const staff = await staffFixture(s, 'auditoria-cierre');
    const body = { period: oldMonth(), confirm: true };
    return final(s.post('/v1/hr/payroll-novelties/close-period', staff.hr.session, body));
  },
  'POST /v1/hr/payroll-novelties/periods/{period}/export': async (s) => {
    const period = oldMonth();
    const { staff } = await manualNovelty(s, period);
    await s.post('/v1/hr/payroll-novelties/close-period', staff.hr.session, {
      period,
      confirm: true,
    });
    return final(s.post(`/v1/hr/payroll-novelties/periods/${period}/export`, staff.hr.session));
  },
};
