import {
  billableMilestonesResponseSchema,
  invoiceCreatedResponseSchema,
  invoiceDetailEnvelopeSchema,
  type InvoiceDetail,
} from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { PortalScenario } from '../portal/support/portal-scenario.js';

const scenario = new PortalScenario('finanzas reglas de facturas');
const INVOICES = '/v1/finance/invoices';

interface World {
  finance: Person;
  milestoneId: string;
  fiscalFileId: string;
  creditFileId: string;
  voidedId: string;
  invoiceId: string;
}

let prepared: World | undefined;

function world(): World {
  if (prepared === undefined) throw new Error('El escenario de facturas no está preparado');
  return prepared;
}

function keyed(path: string, body: object, key: string = crypto.randomUUID()) {
  return scenario.post(path, world().finance.session, body).set('Idempotency-Key', key);
}

function versioned(path: string, body: object, version: number) {
  return keyed(path, body).set('If-Match', `"${String(version)}"`);
}

function createdId(response: Response): string {
  expect(response.status, response.text).toBe(201);
  return invoiceCreatedResponseSchema.parse(response.body).id;
}

function expectRejected(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

async function detail(id: string): Promise<InvoiceDetail> {
  const response = await scenario.get(`${INVOICES}/${id}`, world().finance.session);
  expect(response.status, response.text).toBe(200);
  return invoiceDetailEnvelopeSchema.parse(response.body).data;
}

async function availableMilestoneIds(): Promise<string[]> {
  const response = await scenario.get(`${INVOICES}/billable-milestones`, world().finance.session);
  expect(response.status, response.text).toBe(200);
  return billableMilestonesResponseSchema.parse(response.body).data.map((row) => row.id);
}

function fiscalBody(overrides: object = {}): object {
  return {
    issue_date: scenario.day(0),
    due_date: scenario.day(30),
    subtotal: '1000.00',
    tax_rate: '19.00',
    tax_total: '190.00',
    withholding_total: '0.00',
    total: '1190.00',
    fiscal_number: 'FE-B31-2001',
    fiscal_uuid: null,
    fiscal_file_id: world().fiscalFileId,
    ...overrides,
  };
}

function paymentBody(amount: string): object {
  return {
    paid_on: scenario.day(0),
    amount,
    method: 'Transferencia',
    reference: null,
    support_file_id: null,
  };
}

function creditBody(amount: string, fiscalNumber: string): object {
  return {
    reason: 'Ajuste de prueba sobre el saldo',
    amount,
    issue_date: scenario.day(0),
    fiscal_number: fiscalNumber,
    fiscal_uuid: null,
    fiscal_file_id: world().creditFileId,
  };
}

async function prepare(): Promise<void> {
  const delivery = await scenario.deliveryProject();
  const finance = await scenario.person('finanzas-reglas', ['ADMIN_FINANCIERO']);
  await scenario.inTenant((tx) =>
    tx.prjMilestone.update({
      where: { id: delivery.milestoneId },
      data: {
        status: 'billable',
        doneAt: scenario.clock.now(),
        billableAt: scenario.clock.now(),
        billableAmount: '1000.00',
      },
    }),
  );
  prepared = {
    finance,
    milestoneId: delivery.milestoneId,
    fiscalFileId: await scenario.signedCopy(finance),
    creditFileId: await scenario.signedCopy(finance),
    voidedId: '',
    invoiceId: '',
  };
}

async function voidedRequestFreesMilestone(): Promise<void> {
  const body = { milestone_id: world().milestoneId };
  world().voidedId = createdId(await keyed(INVOICES, body));
  expectRejected(await keyed(INVOICES, body), 422, 'FIN_MILESTONE_NOT_BILLABLE');
  expect(await availableMilestoneIds()).not.toContain(world().milestoneId);
  const voided = await versioned(
    `${INVOICES}/${world().voidedId}/void`,
    { reason: 'Solicitud creada por error en la prueba' },
    1,
  );
  expect(voided.status, voided.text).toBe(204);
  expect(await availableMilestoneIds()).toContain(world().milestoneId);
  world().invoiceId = createdId(await keyed(INVOICES, body));
  expect(world().invoiceId).not.toBe(world().voidedId);
  expect(await auditActions(scenario.db, scenario.tenant.id, world().voidedId)).toEqual([
    'finance.invoice.request:success',
    'finance.invoice.void:success',
  ]);
}

async function rejectsStepsOutOfOrder(): Promise<void> {
  const path = `${INVOICES}/${world().invoiceId}`;
  const statusInvalid = 'FIN_INVOICE_STATUS_INVALID';
  expectRejected(await keyed(`${path}/payments`, paymentBody('100.00')), 409, statusInvalid);
  expectRejected(await versioned(`${path}/fiscal-document`, fiscalBody(), 1), 409, statusInvalid);
  expect((await versioned(`${path}/approval`, {}, 9)).status).toBe(409);
  expect((await versioned(`${path}/approval`, {}, 1)).status).toBe(204);
  expectRejected(
    await versioned(`${path}/fiscal-document`, fiscalBody({ due_date: scenario.day(-1) }), 2),
    409,
    statusInvalid,
  );
  expect((await versioned(`${path}/fiscal-document`, fiscalBody(), 2)).status).toBe(204);
  expectRejected(
    await versioned(`${path}/void`, { reason: 'Intento de anular una factura emitida' }, 3),
    409,
    statusInvalid,
  );
  expect(await detail(world().invoiceId)).toMatchObject({ status: 'issued', balance: '1190.00' });
}

async function keepsSettlementWithinBalance(): Promise<void> {
  const path = `${INVOICES}/${world().invoiceId}`;
  expectRejected(
    await keyed(`${path}/payments`, paymentBody('1190.01')),
    422,
    'FIN_PAYMENT_INVALID',
  );
  const key = crypto.randomUUID();
  const paymentId = createdId(await keyed(`${path}/payments`, paymentBody('500.00'), key));
  expect(createdId(await keyed(`${path}/payments`, paymentBody('500.00'), key))).toBe(paymentId);
  expect((await keyed(`${path}/payments`, paymentBody('100.00'), key)).status).toBe(409);
  expectRejected(
    await keyed(`${path}/credit-notes`, creditBody('690.01', 'NC-B31-2001')),
    422,
    'FIN_CREDIT_NOTE_INVALID',
  );
  createdId(await keyed(`${path}/credit-notes`, creditBody('190.00', 'NC-B31-2002')));
  expect(await detail(world().invoiceId)).toMatchObject({
    status: 'partially_paid',
    paid_total: '500.00',
    balance: '500.00',
  });
}

async function acceptsOnlyOneConcurrentPayment(): Promise<void> {
  const path = `${INVOICES}/${world().invoiceId}/payments`;
  const responses = await Promise.all([
    keyed(path, paymentBody('500.00')),
    keyed(path, paymentBody('500.00')),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(await detail(world().invoiceId)).toMatchObject({
    status: 'paid',
    paid_total: '1000.00',
    balance: '0.00',
  });
}

describe('reglas de facturación', () => {
  it('libera el hito cuando la solicitud se anula', async () => {
    await prepare();
    await voidedRequestFreesMilestone();
  });

  it('rechaza los pasos fuera de orden y no anula una factura emitida', async () => {
    await rejectsStepsOutOfOrder();
  });

  it('no deja recaudar ni acreditar más que el saldo, ni repetir un recaudo', async () => {
    await keepsSettlementWithinBalance();
  });

  it('acepta solo uno de dos recaudos simultáneos por el mismo saldo', async () => {
    await acceptsOnlyOneConcurrentPayment();
  });
});
