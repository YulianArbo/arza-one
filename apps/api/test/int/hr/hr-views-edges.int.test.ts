import {
  hrCreatedResponseSchema,
  leaveRequestListResponseSchema,
  mySpaceResponseSchema,
  offboardingListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { bogotaToday, fromCalendarDate } from '../../../src/modules/core/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { staffFixture, weekdayAfter } from './support/people-fixture.js';

// Lo que muestran las pantallas del B36 cuando faltan datos: un contrato nuevo aún sin firmar, un
// cargo o una persona que ya no existen, un responsable sin cuenta y los retiros ya cerrados.

const scenario = new AccessScenario('vistas de talento humano con datos faltantes');

it('Mi espacio no ofrece el contrato mientras el nuevo está sin firmar', async () => {
  const staff = await staffFixture(scenario, 'contrato-nuevo');
  const day = fromCalendarDate(bogotaToday(scenario.clock.now()));
  await scenario.inTenant((tx) =>
    tx.hrContract.create({
      data: {
        tenantId: scenario.tenant.id,
        employeeId: staff.workerEmployeeId,
        type: 'indefinite',
        startsOn: day,
        salaryBand: 'BANDA_NUEVA',
        salary: '4000000',
        signBy: day,
        companySignerId: uuidv7(),
        sentBy: uuidv7(),
        requestKey: uuidv7(),
      },
    }),
  );
  const space = mySpaceResponseSchema.parse(
    (await scenario.get('/v1/hr/me', staff.worker.session)).body,
  );
  expect(space.employment).toMatchObject({
    salary_band_label: 'BANDA_NUEVA',
    contract_available: false,
  });
});

it('con el cargo y la persona retirados muestra nombres de respaldo', async () => {
  const staff = await staffFixture(scenario, 'datos-retirados');
  await scenario.inTenant(async (tx) => {
    const employee = await tx.hrEmployee.update({
      where: { id: staff.peerEmployeeId },
      data: { positionId: uuidv7() },
    });
    await tx.party.update({ where: { id: employee.partyId }, data: { deletedAt: new Date() } });
  });
  const space = mySpaceResponseSchema.parse(
    (await scenario.get('/v1/hr/me', staff.peer.session)).body,
  );
  expect(space.employment).toMatchObject({
    name: 'Colaborador',
    position: { name: 'Cargo' },
    manager: null,
  });
});

it('un jefe designado que ya no existe se muestra como «Persona»', async () => {
  const staff = await staffFixture(scenario, 'jefe-retirado');
  const starts = weekdayAfter(scenario, 30);
  const created = await scenario
    .post('/v1/hr/me/leave-requests', staff.worker.session, {
      type: 'LUTO',
      starts_on: starts,
      ends_on: starts,
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const ghost = uuidv7();
  await scenario.inTenant((tx) =>
    tx.hrLeaveRequest.update({ where: { id }, data: { approverId: ghost } }),
  );
  const mine = leaveRequestListResponseSchema.parse(
    (await scenario.get('/v1/hr/me/leave-requests', staff.worker.session)).body,
  );
  expect(mine.data.find((leave) => leave.id === id)?.approver).toEqual({
    id: ghost,
    name: 'Persona',
  });
});

it('un retiro anulado no lista activos ni ofrece paz y salvo', async () => {
  const staff = await staffFixture(scenario, 'retiro-anulado');
  const created = await scenario
    .post('/v1/hr/offboardings', staff.hr.session, {
      employee_id: staff.workerEmployeeId,
      reason: 'other',
      last_day: weekdayAfter(scenario, 12),
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const cancel = await scenario
    .post(`/v1/hr/offboardings/${id}/actions/cancel`, staff.hr.session, { reason: 'Se queda' })
    .set('If-Match', '"1"');
  expect(cancel.status).toBe(204);
  const list = offboardingListResponseSchema.parse(
    (await scenario.get('/v1/hr/offboardings', staff.hr.session)).body,
  );
  expect(list.data.find((row) => row.id === id)).toMatchObject({
    status: 'cancelled',
    assets: [],
    can_clear: false,
    account_deactivated_at: null,
    cleared_on: null,
  });
});
