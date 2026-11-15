import { purchaseRequestListResponseSchema } from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { createdId, keyed, putVersioned, versioned } from '../fin/support/ledger-steps.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import {
  ORDERS,
  QUOTES,
  REQUESTS,
  addQuote,
  approvedRequest,
  del,
  draftRequest,
  issuedOrder,
  orderOf,
  purchaseTeam,
  quotedRequest,
  receiptBody,
  requestBody,
  requestOf,
  submittedRequest,
  supplier,
  type PurchaseTeam,
} from './support/purchase-steps.js';

// B33: solicitud de compra, aprobación por montos, cuadro comparativo, orden, recepción y cierre,
// con permisos, segregación de funciones, aislamiento entre empresas y auditoría. Datos ficticios.

const s = new AccessScenario('compras solicitudes y órdenes');

let prepared: PurchaseTeam | undefined;

function team(): PurchaseTeam {
  if (prepared === undefined) throw new Error('El escenario del B33 no está preparado');
  return prepared;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

async function requesterFlow(): Promise<string> {
  const t = team();
  const id = await draftRequest(s, t, '700000.00');
  expect((await s.get(REQUESTS, t.requester.session)).status).toBe(403);
  const mine = await s.get(`${REQUESTS}/mine`, t.requester.session);
  const rows = purchaseRequestListResponseSchema.parse(mine.body).data;
  expect(rows.map((row) => row.id)).toEqual([id]);
  expect(rows[0]).toMatchObject({ status: 'draft', tier: 'low', min_quotes: 1, mine: true });
  const edit = requestBody(t, '800000.00');
  expect((await putVersioned(s, `${REQUESTS}/${id}`, t.requester, edit, 1)).status).toBe(204);
  expect((await putVersioned(s, `${REQUESTS}/${id}`, t.buyer, edit, 2)).status).toBe(404);
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/submission`, t.requester.session), 2)).status,
  ).toBe(204);
  expectError(
    await putVersioned(s, `${REQUESTS}/${id}`, t.requester, edit, 3),
    409,
    'PUR_STATUS_INVALID',
  );
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/approval`, t.requester.session), 3)).status,
  ).toBe(403);
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/approval`, t.approver.session), 3)).status,
  ).toBe(204);
  return id;
}

async function whoAsksDoesNotApprove(): Promise<void> {
  const t = team();
  const id = await submittedRequest(s, t, '500000.00', t.buyer);
  expectError(
    await versioned(s.post(`${REQUESTS}/${id}/approval`, t.buyer.session), 2),
    409,
    'PUR_SEGREGATION_REQUIRED',
  );
  const reason = { reason: 'No está en el presupuesto de la prueba' };
  expectError(
    await versioned(s.post(`${REQUESTS}/${id}/rejection`, t.buyer.session, reason), 2),
    409,
    'PUR_SEGREGATION_REQUIRED',
  );
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/rejection`, t.approver.session, reason), 2)).status,
  ).toBe(204);
  expect(await requestOf(s, t.buyer, id)).toMatchObject({
    status: 'rejected',
    decision_note: reason.reason,
  });
}

async function quoteAndOrder(requestId: string): Promise<string> {
  const t = team();
  const unverified = await supplier(s, t, false);
  const quoteId = await addQuote(s, t, requestId, { supplierId: unverified, amount: '790000.00' });
  const again = { supplierId: unverified, amount: '780000.00' };
  const repeated = await s.post(`${REQUESTS}/${requestId}/quotes`, t.buyer.session, {
    supplier_id: again.supplierId,
    amount: again.amount,
    delivery_days: 3,
    file_id: crypto.randomUUID(),
  });
  expect(repeated.status, repeated.text).toBe(422);
  expect(
    (await versioned(s.post(`${QUOTES}/${quoteId}/selection`, t.buyer.session), 4)).status,
  ).toBe(204);
  expectError(
    await versioned(s.post(`${REQUESTS}/${requestId}/order`, t.buyer.session), 5),
    409,
    'PUR_SUPPLIER_NOT_VERIFIED',
  );
  const verified = await supplier(s, t);
  const better = await addQuote(s, t, requestId, { supplierId: verified, amount: '760000.00' });
  expect(
    (await versioned(s.post(`${QUOTES}/${better}/selection`, t.buyer.session), 5)).status,
  ).toBe(204);
  expectError(await del(s, `${QUOTES}/${better}`, t.buyer), 409, 'PUR_STATUS_INVALID');
  expect((await del(s, `${QUOTES}/${quoteId}`, t.buyer)).status).toBe(204);
  return createdId(versioned(s.post(`${REQUESTS}/${requestId}/order`, t.buyer.session), 6));
}

async function receiveAndClose(requestId: string, orderId: string): Promise<void> {
  const t = team();
  const receipts = `${ORDERS}/${orderId}/receipts`;
  expect((await keyed(s, t.requester, receipts, receiptBody(s, true))).status).toBe(403);
  expectError(
    await versioned(s.post(`${ORDERS}/${orderId}/closure`, t.buyer.session), 1),
    409,
    'PUR_STATUS_INVALID',
  );
  await createdId(keyed(s, t.buyer, receipts, receiptBody(s, false)));
  expect(await orderOf(s, t.buyer, orderId)).toMatchObject({
    status: 'issued',
    total: '760000.00',
  });
  await createdId(keyed(s, t.buyer, receipts, receiptBody(s, true)));
  expectError(await keyed(s, t.buyer, receipts, receiptBody(s, true)), 409, 'PUR_STATUS_INVALID');
  expect(await requestOf(s, t.buyer, requestId)).toMatchObject({ status: 'received' });
  expect((await versioned(s.post(`${ORDERS}/${orderId}/closure`, t.buyer.session), 2)).status).toBe(
    204,
  );
  const order = await orderOf(s, t.buyer, orderId);
  expect(order.status).toBe('closed');
  expect(order.receipts.map((receipt) => receipt.conforming)).toEqual([false, true]);
  expect(await requestOf(s, t.buyer, requestId)).toMatchObject({ status: 'closed' });
}

async function auditTrail(requestId: string, orderId: string): Promise<void> {
  expect(await auditActions(s.db, s.tenant.id, requestId)).toEqual([
    'purchase.request.create:success',
    'purchase.request.update:success',
    'purchase.request.submit:success',
    'purchase.request.approve:success',
  ]);
  expect(await auditActions(s.db, s.tenant.id, orderId)).toEqual([
    'purchase.order.issue:success',
    'purchase.order.receive:success',
    'purchase.order.receive:success',
    'purchase.order.close:success',
  ]);
}

async function whoAsksDoesNotReceive(): Promise<void> {
  const t = team();
  const orderId = await issuedOrder(s, t, t.buyer);
  const receipts = `${ORDERS}/${orderId}/receipts`;
  expectError(
    await keyed(s, t.buyer, receipts, receiptBody(s, true)),
    409,
    'PUR_SEGREGATION_REQUIRED',
  );
  const future = { ...receiptBody(s, true), received_on: '2999-01-01' };
  expectError(await keyed(s, t.approver, receipts, future), 422, 'PUR_RECORD_INVALID');
  await createdId(keyed(s, t.approver, receipts, receiptBody(s, true)));
}

async function capNeedsQuotes(): Promise<void> {
  const t = team();
  const id = await approvedRequest(s, t, '5000000.00');
  expect(await requestOf(s, t.buyer, id)).toMatchObject({ tier: 'mid', min_quotes: 2 });
  const first = await addQuote(s, t, id, {
    supplierId: await supplier(s, t),
    amount: '4900000.00',
  });
  expectError(
    await versioned(s.post(`${QUOTES}/${first}/selection`, t.buyer.session), 3),
    409,
    'PUR_QUOTES_MISSING',
  );
  expectError(
    await versioned(s.post(`${REQUESTS}/${id}/order`, t.buyer.session), 3),
    409,
    'PUR_STATUS_INVALID',
  );
  await addQuote(s, t, id, { supplierId: await supplier(s, t), amount: '5100000.00' });
  expect((await versioned(s.post(`${QUOTES}/${first}/selection`, t.buyer.session), 3)).status).toBe(
    204,
  );
  expect(await requestOf(s, t.buyer, id)).toMatchObject({ status: 'quoted' });
}

async function highTierNeedsDirection(): Promise<void> {
  const t = team();
  const id = await submittedRequest(s, t, '12000000.00');
  expectError(
    await versioned(s.post(`${REQUESTS}/${id}/approval`, t.approver.session), 2),
    403,
    'PUR_APPROVAL_LEVEL_REQUIRED',
  );
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/approval`, t.director.session), 2)).status,
  ).toBe(204);
  expect(await requestOf(s, t.director, id)).toMatchObject({ status: 'approved', tier: 'high' });
}

async function higherQuoteGoesBackToApproval(): Promise<void> {
  const t = team();
  const id = await approvedRequest(s, t, '900000.00');
  const quote = await addQuote(s, t, id, {
    supplierId: await supplier(s, t),
    amount: '2000000.00',
  });
  await addQuote(s, t, id, { supplierId: await supplier(s, t), amount: '2100000.00' });
  expect((await versioned(s.post(`${QUOTES}/${quote}/selection`, t.buyer.session), 3)).status).toBe(
    204,
  );
  expect(await requestOf(s, t.buyer, id)).toMatchObject({
    status: 'in_approval',
    approval_amount: '2000000.00',
    tier: 'mid',
  });
  expect(
    (await versioned(s.post(`${REQUESTS}/${id}/approval`, t.approver.session), 4)).status,
  ).toBe(204);
  expect(await requestOf(s, t.buyer, id)).toMatchObject({ status: 'quoted' });
}

async function isolatedBetweenCompanies(requestId: string): Promise<void> {
  const outsider = await s.person('compras-otra', ['ADMIN_FINANCIERO'], {
    tenantId: s.otherTenant.id,
  });
  expect((await s.get(REQUESTS, outsider.session)).body).toEqual({ data: [] });
  expect((await s.get(ORDERS, outsider.session)).body).toEqual({ data: [] });
  const approval = s.post(`${REQUESTS}/${requestId}/approval`, outsider.session);
  expect((await versioned(approval, 1)).status).toBe(404);
  const { quoteId } = await quotedRequest(s, team());
  const selection = s.post(`${QUOTES}/${quoteId}/selection`, outsider.session);
  expect((await versioned(selection, 4)).status).toBe(404);
}

async function deniedWithoutPermission(): Promise<void> {
  const t = team();
  const auditor = await s.person('auditor-b33', ['AUDITOR']);
  expect((await s.get(REQUESTS, auditor.session)).status).toBe(200);
  expect((await s.get(ORDERS, auditor.session)).status).toBe(200);
  expect((await keyed(s, auditor, REQUESTS, requestBody(t, '1000.00'))).status).toBe(403);
  const id = await approvedRequest(s, t, '300000.00');
  const quote = { supplier_id: crypto.randomUUID(), amount: '1.00', delivery_days: 1 };
  const asRequester = await s.post(`${REQUESTS}/${id}/quotes`, t.requester.session, {
    ...quote,
    file_id: crypto.randomUUID(),
  });
  expect(asRequester.status).toBe(403);
  expect((await versioned(s.post(`${REQUESTS}/${id}/order`, t.director.session), 3)).status).toBe(
    403,
  );
}

describe('compras: solicitud, aprobación por montos, orden y recepción (B33)', () => {
  let requestId = '';
  let orderId = '';

  it('el colaborador pide lo suyo y lo aprueba otra persona', async () => {
    prepared = await purchaseTeam(s, 'b33');
    requestId = await requesterFlow();
    await whoAsksDoesNotApprove();
  });

  it('no se ordena a un proveedor sin conocimiento del tercero vigente', async () => {
    orderId = await quoteAndOrder(requestId);
  });

  it('la recepción conforme permite cerrar; la no conforme queda como novedad', async () => {
    await receiveAndClose(requestId, orderId);
    await auditTrail(requestId, orderId);
  });

  it('quien pidió la compra no la recibe', async () => {
    await whoAsksDoesNotReceive();
  });

  it('una compra sobre el tope no avanza sin las cotizaciones exigidas', async () => {
    await capNeedsQuotes();
  });

  it('el tramo alto lo aprueba la Dirección y una cotización mayor vuelve a aprobación', async () => {
    await highTierNeedsDirection();
    await higherQuoteGoesBackToApproval();
  });

  it('otra empresa no ve ni toca estos registros', async () => {
    await isolatedBetweenCompanies(requestId);
  });

  it('sin el permiso responde 403', async () => {
    await deniedWithoutPermission();
  });
});
