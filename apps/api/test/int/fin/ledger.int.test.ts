import {
  budgetDetailEnvelopeSchema,
  budgetExecutionEnvelopeSchema,
  certifiableHoursResponseSchema,
  expenseListResponseSchema,
  pettyCashResponseSchema,
  reconciliationListResponseSchema,
} from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { day } from '../audit/support/contract-steps.js';
import { running } from '../audit/support/project-route-calls.js';
import {
  FIN,
  createdId,
  expenseBody,
  keyed,
  ledgerBasics,
  movementBody,
  putVersioned,
  versioned,
} from './support/ledger-steps.js';

// B32: presupuesto, gastos, caja menor, conciliación y certificación de costos, con permisos,
// segregación de funciones, aislamiento entre empresas y auditoría. Datos ficticios.

const s = new AccessScenario('finanzas presupuesto y gastos');

interface World {
  finance: Person;
  approver: Person;
  collaborator: Person;
  costCenterId: string;
  budgetId: string;
  expenseId: string;
}

let prepared: World | undefined;

function world(): World {
  if (prepared === undefined) throw new Error('El escenario del B32 no está preparado');
  return prepared;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

async function prepare(): Promise<void> {
  const { costCenterId } = await ledgerBasics(s);
  prepared = {
    finance: await s.person('finanzas-b32', ['ADMIN_FINANCIERO']),
    approver: await s.person('aprobador-b32', ['ADMIN_FINANCIERO']),
    collaborator: await s.person('colaborador-b32', ['COLABORADOR']),
    costCenterId,
    budgetId: '',
    expenseId: '',
  };
}

function line(month: number, planned: string): object {
  return { cost_center_id: world().costCenterId, category: 'SOFTWARE', month, planned };
}

async function budgetFlow(): Promise<void> {
  const { finance, approver } = world();
  const year = Number(day(s, 0).slice(0, 4));
  world().budgetId = await createdId(s.post(`${FIN}/budgets`, finance.session, { year }));
  expectError(await s.post(`${FIN}/budgets`, finance.session, { year }), 422, 'FIN_RECORD_INVALID');
  const path = `${FIN}/budgets/${world().budgetId}`;
  expectError(
    await versioned(s.post(`${path}/approval`, approver.session), 1),
    422,
    'FIN_RECORD_INVALID',
  );
  const lines = { lines: [line(1, '1000000.00'), line(2, '500000.00')] };
  expect((await putVersioned(s, `${path}/lines`, finance, lines, 9)).status).toBe(409);
  expect((await putVersioned(s, `${path}/lines`, finance, lines, 1)).status).toBe(204);
  expectError(
    await versioned(s.post(`${path}/approval`, finance.session), 2),
    409,
    'FIN_SEGREGATION_REQUIRED',
  );
  expect((await versioned(s.post(`${path}/approval`, approver.session), 9)).status).toBe(409);
  expect((await versioned(s.post(`${path}/approval`, approver.session), 2)).status).toBe(204);
  expect((await versioned(s.post(`${path}/approval`, approver.session), 3)).status).toBe(409);
  expectError(await putVersioned(s, `${path}/lines`, finance, lines, 3), 409, 'FIN_STATUS_INVALID');
  const detail = budgetDetailEnvelopeSchema.parse((await s.get(path, finance.session)).body).data;
  expect(detail).toMatchObject({ status: 'approved', planned_total: '1500000.00', line_count: 2 });
}

async function expenseFlow(): Promise<void> {
  const { finance, approver, collaborator, costCenterId } = world();
  const body = await expenseBody(s, collaborator, costCenterId, day(s, 0), '200000.00');
  world().expenseId = await createdId(keyed(s, collaborator, `${FIN}/expenses`, body));
  expect((await s.get(`${FIN}/expenses`, collaborator.session)).status).toBe(403);
  const mine = await s.get(`${FIN}/expenses/mine`, collaborator.session);
  expect(expenseListResponseSchema.parse(mine.body).data.map((row) => row.id)).toEqual([
    world().expenseId,
  ]);
  const path = `${FIN}/expenses/${world().expenseId}`;
  expect((await versioned(s.post(`${path}/approval`, collaborator.session), 1)).status).toBe(403);
  expect((await versioned(s.post(`${path}/approval`, finance.session), 1)).status).toBe(204);
  expectError(
    await versioned(s.post(`${path}/approval`, approver.session), 2),
    409,
    'FIN_STATUS_INVALID',
  );
  expect(await auditActions(s.db, s.tenant.id, world().expenseId)).toEqual([
    'finance.expense.create:success',
    'finance.expense.approve:success',
  ]);
}

async function segregatedRejection(): Promise<void> {
  const { finance, approver, costCenterId } = world();
  const body = await expenseBody(s, finance, costCenterId, day(s, 0), '10000.00');
  const id = await createdId(keyed(s, finance, `${FIN}/expenses`, body));
  const path = `${FIN}/expenses/${id}`;
  expectError(
    await versioned(s.post(`${path}/approval`, finance.session), 1),
    409,
    'FIN_SEGREGATION_REQUIRED',
  );
  const reason = { reason: 'Soporte ilegible en la prueba' };
  expect((await versioned(s.post(`${path}/rejection`, approver.session, reason), 1)).status).toBe(
    204,
  );
  const future = await expenseBody(s, finance, costCenterId, day(s, 3));
  expectError(await keyed(s, finance, `${FIN}/expenses`, future), 422, 'FIN_RECORD_INVALID');
}

async function pettyCashFlow(): Promise<void> {
  const { finance, costCenterId } = world();
  const path = `${FIN}/petty-cash/movements`;
  const today = day(s, 0);
  expectError(
    await keyed(s, finance, path, movementBody('voucher', '1.00', today, costCenterId)),
    422,
    'FIN_RECORD_INVALID',
  );
  await createdId(keyed(s, finance, path, movementBody('opening', '300000.00', today)));
  await createdId(
    keyed(s, finance, path, movementBody('voucher', '50000.00', today, costCenterId)),
  );
  const tooMuch = movementBody('voucher', '250000.01', today, costCenterId);
  expectError(await keyed(s, finance, path, tooMuch), 422, 'FIN_RECORD_INVALID');
  const overFund = movementBody('replenishment', '50000.01', today);
  expectError(await keyed(s, finance, path, overFund), 422, 'FIN_RECORD_INVALID');
  const ledger = pettyCashResponseSchema.parse(
    (await s.get(`${FIN}/petty-cash`, finance.session)).body,
  );
  expect(ledger.data).toMatchObject({ fund: '300000.00', balance: '250000.00' });
  expect(ledger.data.movements).toHaveLength(2);
}

async function executionAddsSpending(): Promise<void> {
  const response = await s.get(
    `${FIN}/budgets/${world().budgetId}/execution`,
    world().finance.session,
  );
  const execution = budgetExecutionEnvelopeSchema.parse(response.body).data;
  expect(execution.by_cost_center).toEqual([
    expect.objectContaining({ planned: '1500000.00', executed: '250000.00' }),
  ]);
  const transport = execution.rows.find((row) => row.category.code === 'TRANSPORT');
  expect(transport).toMatchObject({ planned: '0.00', executed: '50000.00' });
}

async function reconciliationFlow(): Promise<void> {
  const { finance } = world();
  const body = {
    account: 'Banco ficticio ahorros ···4321',
    period: day(s, 0).slice(0, 7),
    book_balance: '1000000.00',
    bank_balance: '985000.00',
    differences: [],
  };
  const id = await createdId(s.post(`${FIN}/bank-reconciliations`, finance.session, body));
  expect((await s.post(`${FIN}/bank-reconciliations`, finance.session, body)).status).toBe(422);
  const path = `${FIN}/bank-reconciliations/${id}`;
  expectError(
    await versioned(s.post(`${path}/close`, finance.session), 1),
    422,
    'FIN_RECORD_INVALID',
  );
  const fixed = {
    ...body,
    differences: [{ description: 'Comisión bancaria', amount: '-15000.00' }],
  };
  expect((await putVersioned(s, path, finance, fixed, 9)).status).toBe(409);
  expect((await putVersioned(s, path, finance, fixed, 1)).status).toBe(204);
  expect((await versioned(s.post(`${path}/close`, finance.session), 9)).status).toBe(409);
  expect((await versioned(s.post(`${path}/close`, finance.session), 2)).status).toBe(204);
  expect((await versioned(s.post(`${path}/close`, finance.session), 3)).status).toBe(409);
  const list = reconciliationListResponseSchema.parse(
    (await s.get(`${FIN}/bank-reconciliations`, finance.session)).body,
  );
  expect(list.data[0]).toMatchObject({ status: 'reconciled', unexplained: '0.00' });
}

async function certificationFlow(): Promise<void> {
  const { finance } = world();
  const crew = await running(s);
  const period = day(s, 0).slice(0, 7);
  await s.inTenant((tx) =>
    tx.prjTimeEntry.create({
      data: {
        tenantId: s.tenant.id,
        projectId: crew.id,
        userId: crew.leader.id,
        workDate: new Date(`${day(s, 0)}T00:00:00.000Z`),
        hours: '6.50',
        status: 'approved',
        decidedBy: finance.id,
        decidedAt: new Date(),
      },
    }),
  );
  const hours = await s.get(
    `${FIN}/cost-certifications/hours?project_id=${crew.id}&period=${period}`,
    finance.session,
  );
  expect(certifiableHoursResponseSchema.parse(hours.body).data.hours).toBe('6.50');
  const body = { project_id: crew.id, period, amount: '850000.00', phase: 'development' };
  await createdId(keyed(s, finance, `${FIN}/cost-certifications`, body));
  expectError(
    await keyed(s, finance, `${FIN}/cost-certifications`, body),
    422,
    'FIN_RECORD_INVALID',
  );
}

async function isolatedBetweenCompanies(): Promise<void> {
  const outsider = await s.person('finanzas-otra', ['ADMIN_FINANCIERO'], {
    tenantId: s.otherTenant.id,
  });
  const budgets = await s.get(`${FIN}/budgets`, outsider.session);
  expect(budgets.body).toEqual({ data: [] });
  expect((await s.get(`${FIN}/budgets/${world().budgetId}`, outsider.session)).status).toBe(404);
  const expenses = await s.get(`${FIN}/expenses`, outsider.session);
  expect(expenseListResponseSchema.parse(expenses.body).data).toEqual([]);
  const approval = s.post(`${FIN}/expenses/${world().expenseId}/approval`, outsider.session);
  expect((await versioned(approval, 2)).status).toBe(404);
}

async function deniedWithoutPermission(): Promise<void> {
  const commercial = await s.person('comercial-b32', ['COMERCIAL']);
  expect((await s.get(`${FIN}/budgets`, commercial.session)).status).toBe(200);
  expect((await s.get(`${FIN}/expenses`, commercial.session)).status).toBe(403);
  expect((await s.post(`${FIN}/budgets`, commercial.session, { year: 2090 })).status).toBe(403);
  const accountant = await s.person('contador-b32', ['CONTADOR']);
  expect((await s.get(`${FIN}/petty-cash`, accountant.session)).status).toBe(200);
  const movement = movementBody('replenishment', '1.00', day(s, 0));
  expect((await keyed(s, accountant, `${FIN}/petty-cash/movements`, movement)).status).toBe(403);
}

describe('presupuesto, gastos, caja menor, conciliación y certificación (B32)', () => {
  it('el presupuesto lo aprueba otra persona y luego no se edita', async () => {
    await prepare();
    await budgetFlow();
  });

  it('el colaborador registra sus gastos y los aprueba otra persona, con auditoría', async () => {
    await expenseFlow();
    await segregatedRejection();
  });

  it('la caja menor nunca queda negativa ni pasa del fondo', async () => {
    await pettyCashFlow();
  });

  it('el presupuesto muestra lo ejecutado por centro de costo', async () => {
    await executionAddsSpending();
  });

  it('la conciliación se cierra solo cuando cuadra', async () => {
    await reconciliationFlow();
  });

  it('la certificación toma las horas aprobadas del proyecto en el mes', async () => {
    await certificationFlow();
  });

  it('otra empresa no ve ni toca estos registros', async () => {
    await isolatedBetweenCompanies();
  });

  it('sin el permiso responde 403', async () => {
    await deniedWithoutPermission();
  });
});
