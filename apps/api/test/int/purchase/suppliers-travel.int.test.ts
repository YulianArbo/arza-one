import {
  purchaseOptionsResponseSchema,
  supplierEvaluationListResponseSchema,
  travelRequestListResponseSchema,
  type TravelRequest,
} from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { signedCopy } from '../audit/support/contract-steps.js';
import { createdId, keyed, putVersioned, versioned } from '../fin/support/ledger-steps.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import {
  EVALUATIONS,
  REQUESTS,
  TRAVEL,
  approvedTravel,
  del,
  purchaseTeam,
  supplier,
  travelBody,
  travelExpense,
  type PurchaseTeam,
} from './support/purchase-steps.js';

// B33: evaluación de proveedores y viajes con su legalización, con permisos, segregación de
// funciones, aislamiento entre empresas y auditoría. Datos ficticios.

const s = new AccessScenario('compras proveedores y viajes');

let prepared: PurchaseTeam | undefined;

function team(): PurchaseTeam {
  if (prepared === undefined) throw new Error('El escenario del B33 no está preparado');
  return prepared;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

function evaluation(supplierId: string, service: number): object {
  return {
    supplier_id: supplierId,
    kind: 'reevaluation',
    period: '2026-2',
    criteria: { quality: 5, compliance: 4, price: 4, service },
    note: null,
  };
}

async function evaluationFlow(): Promise<void> {
  const t = team();
  const verified = await supplier(s, t);
  const unverified = await supplier(s, t, false);
  const options = purchaseOptionsResponseSchema.parse(
    (await s.get(`${REQUESTS}/options`, t.buyer.session)).body,
  ).data;
  expect(options.suppliers.find((row) => row.id === verified)?.verified).toBe(true);
  expect(options.suppliers.find((row) => row.id === unverified)?.verified).toBe(false);
  expect(options.tiers).toMatchObject({ quotes_low: 1, quotes_mid: 2, quotes_high: 3 });
  const id = await createdId(s.post(EVALUATIONS, t.buyer.session, evaluation(verified, 4)));
  expectError(
    await s.post(EVALUATIONS, t.buyer.session, evaluation(verified, 2)),
    422,
    'PUR_RECORD_INVALID',
  );
  await createdId(s.post(EVALUATIONS, t.buyer.session, evaluation(unverified, 1)));
  const outsider = evaluation(crypto.randomUUID(), 3);
  expectError(await s.post(EVALUATIONS, t.buyer.session, outsider), 422, 'PUR_RECORD_INVALID');
  const list = supplierEvaluationListResponseSchema.parse(
    (await s.get(EVALUATIONS, t.director.session)).body,
  ).data;
  expect(list.find((row) => row.id === id)).toMatchObject({ score: '4.25', result: 'approved' });
  expect(list.find((row) => row.supplier.id === unverified)).toMatchObject({
    score: '3.50',
    result: 'conditional',
  });
  expect(await auditActions(s.db, s.tenant.id, id)).toEqual(['purchase.supplier.evaluate:success']);
}

async function travelOf(person: Person, id: string, own = false): Promise<TravelRequest> {
  const response = await s.get(own ? `${TRAVEL}/mine` : TRAVEL, person.session);
  expect(response.status, response.text).toBe(200);
  const found = travelRequestListResponseSchema
    .parse(response.body)
    .data.find((row) => row.id === id);
  if (found === undefined) throw new Error('El viaje no aparece en la lista');
  return found;
}

async function travelApprovalFlow(): Promise<void> {
  const t = team();
  const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, 5)));
  expect((await s.get(TRAVEL, t.requester.session)).status).toBe(403);
  const edit = travelBody(s, 5, '650000.00');
  expect((await putVersioned(s, `${TRAVEL}/${id}`, t.requester, edit, 1)).status).toBe(204);
  expect((await putVersioned(s, `${TRAVEL}/${id}`, t.buyer, edit, 2)).status).toBe(404);
  expect(
    (await versioned(s.post(`${TRAVEL}/${id}/submission`, t.requester.session), 2)).status,
  ).toBe(204);
  expect((await versioned(s.post(`${TRAVEL}/${id}/approval`, t.requester.session), 3)).status).toBe(
    403,
  );
  const reason = { reason: 'El viaje se reemplaza por una reunión virtual' };
  expect(
    (await versioned(s.post(`${TRAVEL}/${id}/rejection`, t.approver.session, reason), 3)).status,
  ).toBe(204);
  expect(await travelOf(t.requester, id, true)).toMatchObject({
    status: 'rejected',
    advance_amount: '650000.00',
    decision_note: reason.reason,
  });
  const own = await createdId(keyed(s, t.buyer, TRAVEL, travelBody(s, 5)));
  await versioned(s.post(`${TRAVEL}/${own}/submission`, t.buyer.session), 1).expect(204);
  expectError(
    await versioned(s.post(`${TRAVEL}/${own}/approval`, t.buyer.session), 2),
    409,
    'PUR_SEGREGATION_REQUIRED',
  );
}

async function legalizationFlow(): Promise<string> {
  const t = team();
  const future = await approvedTravel(s, t, 4);
  const early = { concept: 'Taxi ficticio', amount: '1.00', support_file_id: crypto.randomUUID() };
  expectError(
    await keyed(s, t.requester, `${TRAVEL}/${future}/expenses`, early),
    409,
    'PUR_STATUS_INVALID',
  );
  const id = await approvedTravel(s, t);
  expectError(
    await versioned(s.post(`${TRAVEL}/${id}/legalization`, t.requester.session), 3),
    422,
    'PUR_RECORD_INVALID',
  );
  expectError(
    await keyed(s, t.requester, `${TRAVEL}/${id}/expenses`, early),
    422,
    'PUR_SUPPORT_FILE_INVALID',
  );
  await travelExpense(s, t, id, '320000.50');
  const extra = await travelExpense(s, t, id, '99999.00');
  await travelExpense(s, t, id, '250000.00');
  expect((await del(s, `/v1/travel-expenses/${extra}`, t.buyer)).status).toBe(404);
  expect((await del(s, `/v1/travel-expenses/${extra}`, t.requester)).status).toBe(204);
  expect((await versioned(s.post(`${TRAVEL}/${id}/legalization`, t.buyer.session), 3)).status).toBe(
    404,
  );
  expect(
    (await versioned(s.post(`${TRAVEL}/${id}/legalization`, t.requester.session), 3)).status,
  ).toBe(204);
  return id;
}

async function legalizedTravel(id: string): Promise<void> {
  const t = team();
  const travel = await travelOf(t.approver, id);
  expect(travel).toMatchObject({
    status: 'legalized',
    advance_amount: '500000.00',
    expenses_total: '570000.50',
    balance: '-70000.50',
  });
  expect(travel.expenses).toHaveLength(2);
  const late = { concept: 'Gasto tardío', amount: '1.00', support_file_id: crypto.randomUUID() };
  expectError(
    await keyed(s, t.requester, `${TRAVEL}/${id}/expenses`, late),
    409,
    'PUR_STATUS_INVALID',
  );
  expect(await auditActions(s.db, s.tenant.id, id)).toEqual([
    'purchase.travel.create:success',
    'purchase.travel.submit:success',
    'purchase.travel.approve:success',
    'purchase.travel.expense.add:success',
    'purchase.travel.expense.add:success',
    'purchase.travel.expense.add:success',
    'purchase.travel.expense.remove:success',
    'purchase.travel.legalize:success',
  ]);
}

async function isolatedAndDenied(travelId: string): Promise<void> {
  const t = team();
  const outsider = await s.person('compras-viajes-otra', ['ADMIN_FINANCIERO'], {
    tenantId: s.otherTenant.id,
  });
  expect((await s.get(TRAVEL, outsider.session)).body).toEqual({ data: [] });
  expect((await s.get(EVALUATIONS, outsider.session)).body).toEqual({ data: [] });
  const approval = s.post(`${TRAVEL}/${travelId}/approval`, outsider.session);
  expect((await versioned(approval, 1)).status).toBe(404);
  expect((await s.get(EVALUATIONS, t.requester.session)).status).toBe(403);
  const body = evaluation(crypto.randomUUID(), 3);
  expect((await s.post(EVALUATIONS, t.requester.session, body)).status).toBe(403);
  expect((await s.post(EVALUATIONS, t.director.session, body)).status).toBe(403);
  const accountant = await s.person('contador-b33', ['CONTADOR']);
  expect((await s.get(TRAVEL, accountant.session)).status).toBe(200);
  expect((await keyed(s, accountant, TRAVEL, travelBody(s, 5))).status).toBe(403);
}

describe('evaluación de proveedores y viajes (B33)', () => {
  let travelId = '';

  it('evalúa al proveedor una vez por periodo y da el resultado por puntaje', async () => {
    prepared = await purchaseTeam(s, 'b33-viajes');
    await evaluationFlow();
  });

  it('el viajero pide lo suyo y lo decide otra persona', async () => {
    await travelApprovalFlow();
  });

  it('el viaje se legaliza con gastos y soportes desde el día de salida', async () => {
    travelId = await legalizationFlow();
    await legalizedTravel(travelId);
  });

  it('otra empresa no ve estos registros y sin el permiso responde 403', async () => {
    await isolatedAndDenied(travelId);
  });
});

it('reenvía la solicitud de viaje y conserva el borrador ante versiones obsoletas', async () => {
  const t = team();
  const key = crypto.randomUUID();
  const body = travelBody(s, 5);
  const post = (input: object) =>
    s.post(TRAVEL, t.requester.session, input).set('Idempotency-Key', key);
  const id = await createdId(post(body));
  expect(await createdId(post(body))).toBe(id);
  expectError(
    await post({ ...body, destination: 'Otro destino ficticio' }),
    409,
    'IDEMPOTENCY_KEY_REUSED',
  );
  const path = `${TRAVEL}/${id}`;
  expectError(await putVersioned(s, path, t.requester, body, 9), 409, 'VERSION_CONFLICT');
  expectError(
    await versioned(s.post(`${path}/approval`, t.approver.session), 1),
    409,
    'PUR_STATUS_INVALID',
  );
  await versioned(s.post(`${path}/submission`, t.requester.session), 1).expect(204);
  expectError(await putVersioned(s, path, t.requester, body, 2), 409, 'PUR_STATUS_INVALID');
});

it('deduplica un gasto de viaje y rechaza reutilizarlo para otro viaje', async () => {
  const t = team();
  const id = await approvedTravel(s, t);
  const other = await approvedTravel(s, t);
  const key = crypto.randomUUID();
  const body = {
    concept: 'Traslado ficticio',
    amount: '100.00',
    support_file_id: await signedCopy(s, t.requester),
  };
  const post = (travel: string) =>
    s.post(`${TRAVEL}/${travel}/expenses`, t.requester.session, body).set('Idempotency-Key', key);
  const expenseId = await createdId(post(id));
  expect(await createdId(post(id))).toBe(expenseId);
  expectError(await post(other), 409, 'IDEMPOTENCY_KEY_REUSED');
  expect((await travelOf(t.requester, id, true)).expenses).toHaveLength(1);
  expect((await travelOf(t.requester, other, true)).expenses).toHaveLength(0);
  const path = `/v1/travel-expenses/${expenseId}`;
  await del(s, path, t.requester).expect(204);
  expectError(await del(s, path, t.requester), 404, 'PUR_RECORD_NOT_FOUND');
});
