import { expenseListResponseSchema, pettyCashResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { day } from '../audit/support/contract-steps.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  FIN,
  createdId,
  expenseBody,
  keyed,
  ledgerBasics,
  movementBody,
  versioned,
} from './support/ledger-steps.js';

const scenario = new AccessScenario('finanzas controles del libro');

it('conserva un solo gasto ante reintentos y valida el proveedor y la versión', async () => {
  const { costCenterId } = await ledgerBasics(scenario);
  const finance = await scenario.person('finanzas', ['ADMIN_FINANCIERO']);
  const approver = await scenario.person('aprobador', ['ADMIN_FINANCIERO']);
  const path = `${FIN}/expenses`;
  const body = await expenseBody(scenario, finance, costCenterId, day(scenario, 0));
  const supplier = await keyed(scenario, finance, path, { ...body, supplier_id: uuidv7() });
  expect(supplier.status, supplier.text).toBe(422);
  const key = crypto.randomUUID();
  const post = (input: object) =>
    scenario.post(path, finance.session, input).set('Idempotency-Key', key);
  const id = await createdId(post(body));
  expect(await createdId(post(body))).toBe(id);
  expect((await post({ ...body, amount: '1.00' })).status).toBe(409);
  const options = await scenario.get(`${FIN}/options`, finance.session);
  expect(options.status, options.text).toBe(200);
  const entries = await scenario.get(path, finance.session);
  expect(expenseListResponseSchema.parse(entries.body).data.map((row) => row.id)).toEqual([id]);
  const approve = `${path}/${id}/approval`;
  expect((await versioned(scenario.post(approve, approver.session), 9)).status).toBe(409);
  expect(
    (await versioned(scenario.post(`${path}/${uuidv7()}/approval`, approver.session), 1)).status,
  ).toBe(404);
  expect((await versioned(scenario.post(approve, approver.session), 1)).status).toBe(204);
});

it('registra un solo vale al reintentar y rechaza fechas y soportes inválidos', async () => {
  const { costCenterId } = await ledgerBasics(scenario);
  const finance = await scenario.person('caja', ['ADMIN_FINANCIERO']);
  const path = `${FIN}/petty-cash/movements`;
  const today = day(scenario, 0);
  const opening = movementBody('opening', '300.00', today);
  await createdId(keyed(scenario, finance, path, opening));
  expect((await keyed(scenario, finance, path, opening)).status).toBe(422);
  const future = movementBody('voucher', '50.00', day(scenario, 1), costCenterId);
  expect((await keyed(scenario, finance, path, future)).status).toBe(422);
  const voucher = movementBody('voucher', '50.00', today, costCenterId);
  expect(
    (await keyed(scenario, finance, path, { ...voucher, support_file_id: uuidv7() })).status,
  ).toBe(422);
  const key = crypto.randomUUID();
  const post = (input: object) =>
    scenario.post(path, finance.session, input).set('Idempotency-Key', key);
  const id = await createdId(post(voucher));
  expect(await createdId(post(voucher))).toBe(id);
  expect((await post({ ...voucher, amount: '60.00' })).status).toBe(409);
  const ledger = await scenario.get(`${FIN}/petty-cash`, finance.session);
  const { data } = pettyCashResponseSchema.parse(ledger.body);
  expect(data.balance).toBe('250.00');
  expect(data.movements).toHaveLength(2);
});
