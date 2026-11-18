import { employeeDetailResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { bogotaToday } from '../../../src/modules/core/index.js';
import { putVersioned } from '../fin/support/ledger-steps.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { pendingEmployee as employeeFixture } from './support/employee-fixture.js';

// Casos límite de la ficha del colaborador (B35): historia laboral, tareas de inducción,
// vinculación y anulación, y lo que ve cada rol de la ficha y del contrato.

const scenario = new AccessScenario('casos límite de la ficha laboral');
const DAY = 24 * 60 * 60 * 1000;
const MISSING = '01900000-0000-7000-8000-00000000dead';

function today(): string {
  return bogotaToday(scenario.clock.now());
}

function pendingEmployee(options: { readonly contract: boolean }) {
  return employeeFixture(scenario, options);
}

it('protege la historia laboral y las tareas de inducción', async () => {
  const recruiter = await scenario.person('expediente', ['TALENTO_HUMANO']);
  const employee = await pendingEmployee({ contract: false });
  const path = `/v1/hr/employees/${employee.id}`;
  const put = (item: string, body: object, version: number) =>
    putVersioned(scenario, `${path}/file/${item}`, recruiter, body, version);
  expect(
    (
      await putVersioned(
        scenario,
        `/v1/hr/employees/${MISSING}/file/education`,
        recruiter,
        { status: 'received' },
        1,
      )
    ).status,
  ).toBe(404);
  expect((await put('education', { status: 'received' }, 7)).status).toBe(409);
  expect((await put('signed_contract', { status: 'received' }, 1)).status).toBe(409);
  const foreign = await put('education', { status: 'received', file_id: uuidv7() }, 1);
  expect(foreign.status).toBe(422);
  const complete = (taskId: string, body: object, version: number) =>
    scenario
      .post(`${path}/onboarding/${taskId}/actions/complete`, recruiter.session, body)
      .set('If-Match', `"${String(version)}"`);
  expect((await complete(MISSING, { done_on: today() }, 1)).status).toBe(404);
  expect((await complete(employee.taskId, { done_on: today() }, 5)).status).toBe(409);
  const future = new Date(scenario.clock.now().getTime() + 3 * DAY).toISOString().slice(0, 10);
  expect((await complete(employee.taskId, { done_on: future }, 1)).status).toBe(422);
  expect((await complete(employee.taskId, { done_on: today() }, 1)).status).toBe(204);
  expect((await complete(employee.taskId, { done_on: today() }, 2)).status).toBe(409);
});

it('muestra a cada rol solo lo que le corresponde de la ficha laboral', async () => {
  const recruiter = await scenario.person('ficha-th', ['TALENTO_HUMANO']);
  const director = await scenario.person('ficha-direccion', ['DIRECCION']);
  const withoutContract = await pendingEmployee({ contract: false });
  const preparing = await pendingEmployee({ contract: true });
  const detail = async (person: Person, id: string) => {
    const response = await scenario.get(`/v1/hr/employees/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return employeeDetailResponseSchema.parse(response.body);
  };
  const plain = await detail(recruiter, withoutContract.id);
  expect(plain.contract).toBeNull();
  expect(plain.employee).toMatchObject({ name: 'Persona no disponible' });
  expect(plain.employee.position.name).toBe('Cargo no disponible');
  const hr = await detail(recruiter, preparing.id);
  expect(hr.contract).toMatchObject({
    salary: '2500000.00',
    signers: [],
    document_available: false,
  });
  const board = await detail(director, preparing.id);
  expect(board).toMatchObject({ email: null, file: null });
  expect(board.contract?.salary).toBe('2500000.00');
  const link = (person: Person, id: string) =>
    scenario.post(`/v1/hr/employees/${id}/contract/download-link`, person.session, {});
  expect((await link(recruiter, MISSING)).status).toBe(404);
  expect((await link(recruiter, withoutContract.id)).status).toBe(404);
  expect((await link(recruiter, preparing.id)).status).toBe(404);
  expect((await scenario.get(`/v1/hr/employees/${MISSING}`, recruiter.session)).status).toBe(404);
});

it('no vincula ni anula lo que no está pendiente o cambió', async () => {
  const recruiter = await scenario.person('vinculacion-limites', ['TALENTO_HUMANO']);
  const employee = await pendingEmployee({ contract: true });
  const step = (id: string, action: string, version: number, body: object = {}) =>
    scenario
      .post(`/v1/hr/employees/${id}/actions/${action}`, recruiter.session, body)
      .set('If-Match', `"${String(version)}"`);
  const reason = { reason: 'Desistió del cargo' };
  expect((await step(MISSING, 'activate', 1)).status).toBe(404);
  expect((await step(employee.id, 'activate', 9)).status).toBe(409);
  expect((await step(employee.id, 'activate', 1)).status).toBe(409);
  expect((await step(MISSING, 'cancel-hiring', 1, reason)).status).toBe(404);
  expect((await step(employee.id, 'cancel-hiring', 9, reason)).status).toBe(409);
  expect((await step(employee.id, 'cancel-hiring', 1, reason)).status).toBe(409);
  await scenario.inTenant((tx) =>
    tx.hrEmployee.update({
      where: { id: employee.id },
      data: { status: 'cancelled', closedReason: 'Prueba' },
    }),
  );
  const { version } = await scenario.inTenant((tx) =>
    tx.hrEmployee.findUniqueOrThrow({ where: { id: employee.id } }),
  );
  expect((await step(employee.id, 'activate', version)).status).toBe(409);
  expect((await step(employee.id, 'cancel-hiring', version, reason)).status).toBe(409);
});
