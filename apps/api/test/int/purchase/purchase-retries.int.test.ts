import type { Response } from 'supertest';
import { expect, it } from 'vitest';

import { day } from '../audit/support/contract-steps.js';
import { createdId, putVersioned, versioned } from '../fin/support/ledger-steps.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  ORDERS,
  REQUESTS,
  issuedOrder,
  orderOf,
  purchaseTeam,
  receiptBody,
  requestBody,
  requestOf,
} from './support/purchase-steps.js';

const s = new AccessScenario('compras reintentos');

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

it('reenvía una solicitud sin duplicarla y rechaza una versión obsoleta', async () => {
  const t = await purchaseTeam(s, 'reintentos-solicitud');
  const key = crypto.randomUUID();
  const body = requestBody(t, '500000.00');
  const post = (input: object) =>
    s.post(REQUESTS, t.requester.session, input).set('Idempotency-Key', key);
  const id = await createdId(post(body));
  expect(await createdId(post(body))).toBe(id);
  expectError(
    await post({ ...body, description: 'Otra compra con la misma clave' }),
    409,
    'IDEMPOTENCY_KEY_REUSED',
  );
  const path = `${REQUESTS}/${id}`;
  expectError(await putVersioned(s, path, t.requester, body, 9), 409, 'VERSION_CONFLICT');
  expectError(
    await versioned(s.post(`${path}/approval`, t.approver.session), 1),
    409,
    'PUR_STATUS_INVALID',
  );
  expect(await requestOf(s, t.buyer, id)).toMatchObject({ status: 'draft', version: 1 });
});

it('reenvía la recepción sin duplicarla y rechaza cambios bajo la misma clave', async () => {
  const t = await purchaseTeam(s, 'reintentos-recepcion');
  const id = await issuedOrder(s, t);
  const key = crypto.randomUUID();
  const path = `${ORDERS}/${id}/receipts`;
  const post = (input: object) => s.post(path, t.buyer.session, input).set('Idempotency-Key', key);
  const body = receiptBody(s, true);
  expectError(await post({ ...body, received_on: day(s, -1) }), 422, 'PUR_RECORD_INVALID');
  expectError(await post({ ...body, received_on: day(s, 1) }), 422, 'PUR_RECORD_INVALID');
  const receiptId = await createdId(post(body));
  expect(await createdId(post(body))).toBe(receiptId);
  expectError(await post(receiptBody(s, false)), 409, 'IDEMPOTENCY_KEY_REUSED');
  expectError(await post({ ...body, received_on: day(s, -1) }), 409, 'IDEMPOTENCY_KEY_REUSED');
  expectError(
    await versioned(s.post(`${ORDERS}/${id}/closure`, t.buyer.session), 9),
    409,
    'VERSION_CONFLICT',
  );
  expect((await orderOf(s, t.buyer, id)).receipts).toHaveLength(1);
});
