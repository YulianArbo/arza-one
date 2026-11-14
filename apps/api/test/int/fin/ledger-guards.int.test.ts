import { expenseListResponseSchema, pettyCashResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { day } from '../audit/support/contract-steps.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { organizationBody } from '../party/support/party-scenario.js';
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

it('rechaza gastos con centro, rubro o soporte inexistentes', async () => {
  const { costCenterId } = await ledgerBasics(scenario);
  const finance = await scenario.person('finanzas-validaciones', ['ADMIN_FINANCIERO']);
  const body = await expenseBody(scenario, finance, costCenterId, day(scenario, 0));
  for (const overrides of [
    { cost_center_id: uuidv7() },
    { category: 'RUBRO_INEXISTENTE' },
    { support_file_id: uuidv7() },
  ]) {
    const result = await keyed(scenario, finance, `${FIN}/expenses`, { ...body, ...overrides });
    expect(result.status, result.text).toBe(422);
  }
});

it('muestra el proveedor vigente en el gasto y en las opciones de registro', async () => {
  const { costCenterId } = await ledgerBasics(scenario);
  const finance = await scenario.person('finanzas-proveedor', ['ADMIN_FINANCIERO']);
  const sales = await scenario.person('comercial-proveedor', ['COMERCIAL']);
  const supplier = await createdId(
    scenario.post('/v1/parties', sales.session, organizationBody({ roles: ['supplier'] })),
  );
  const body = await expenseBody(scenario, finance, costCenterId, day(scenario, 0));
  const id = await createdId(
    keyed(scenario, finance, `${FIN}/expenses`, { ...body, supplier_id: supplier }),
  );
  const entries = await scenario.get(`${FIN}/expenses`, finance.session);
  const entry = expenseListResponseSchema.parse(entries.body).data.find((row) => row.id === id);
  expect(entry).toMatchObject({ supplier: { id: supplier }, mine: true });
  const options = await scenario.get(`${FIN}/options`, finance.session);
  expect(options.status, options.text).toBe(200);
  expect(JSON.stringify(options.body)).toContain(supplier);
});

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
  expect(
    expenseListResponseSchema.parse(entries.body).data.filter((row) => row.id === id),
  ).toHaveLength(1);
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
  const openingLedger = await scenario.get(`${FIN}/petty-cash`, finance.session);
  expect(pettyCashResponseSchema.parse(openingLedger.body).data).toMatchObject({
    balance: '300.00',
  });
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
  expect((await post(opening)).status).toBe(409);
  const ledger = await scenario.get(`${FIN}/petty-cash`, finance.session);
  const { data } = pettyCashResponseSchema.parse(ledger.body);
  expect(data.balance).toBe('250.00');
  expect(data.movements).toHaveLength(2);
});
