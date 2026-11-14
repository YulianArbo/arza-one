import {
  invoiceCreatedResponseSchema,
  invoiceDetailEnvelopeSchema,
  portalInvoiceListSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { PortalScenario } from '../portal/support/portal-scenario.js';

const scenario = new PortalScenario('finanzas facturas');
interface Actors {
  delivery: Awaited<ReturnType<typeof scenario.deliveryProject>>;
  finance: Person;
  financeOther: Person;
  forbidden: Person;
  fiscalFileId: string;
  creditFileId: string;
}

function keyed(person: Person, path: string, body: object) {
  return scenario.post(path, person.session, body).set('Idempotency-Key', crypto.randomUUID());
}

describe('facturación y recaudos', () => {
  it('registra la factura, el crédito y el recaudo, y limita los soportes del portal', async () => {
    await verifyInvoiceFlow();
  });
});

async function verifyInvoiceFlow(): Promise<void> {
  const actors = await prepareActors();
  const invoice = await issueInvoice(actors);
  const settlement = await registerSettlement(
    actors.finance,
    actors.creditFileId,
    invoice.detailPath,
  );
  await assertInvoiceAccounting(actors, invoice, settlement);
  const portal = await assertPortalInvoice(
    actors.delivery.client.partyId,
    invoice.invoiceId,
    settlement.noteId,
  );
  await assertPortalIsolation(portal, actors.delivery.sales, invoice.invoiceId, settlement.noteId);
}

async function prepareActors(): Promise<Actors> {
  const delivery = await scenario.deliveryProject();
  const finance = await scenario.person('finanzas', ['ADMIN_FINANCIERO']);
  const financeOther = await scenario.person('finanzas-otra-empresa', ['ADMIN_FINANCIERO'], {
    tenantId: scenario.otherTenant.id,
  });
  const forbidden = await scenario.person('equipo-sin-permiso', ['EQUIPO_PROYECTO']);
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
  return {
    delivery,
    finance,
    financeOther,
    forbidden,
    fiscalFileId: await scenario.signedCopy(finance),
    creditFileId: await scenario.signedCopy(finance),
  };
}

async function issueInvoice(actors: Actors): Promise<{ invoiceId: string; detailPath: string }> {
  const path = '/v1/finance/invoices';
  expect((await scenario.get(path, actors.forbidden.session)).status).toBe(403);
  const empty = await scenario.get(path, actors.financeOther.session);
  expect(empty.status, empty.text).toBe(200);
  expect(empty.body).toMatchObject({ data: [] });
  expect(
    (await keyed(actors.forbidden, path, { milestone_id: actors.delivery.milestoneId })).status,
  ).toBe(403);
  const created = await keyed(actors.finance, path, { milestone_id: actors.delivery.milestoneId });
  expect(created.status, created.text).toBe(201);
  const invoiceId = invoiceCreatedResponseSchema.parse(created.body).id;
  const portal = await scenario.readyPerson('CLIENTE_ADMIN', actors.delivery.client.partyId);
  expect(
    portalInvoiceListSchema.parse((await scenario.get('/v1/portal/invoices', portal.session)).body)
      .data,
  ).toEqual([]);
  const unissued = await scenario.post(`/v1/portal/invoices/${invoiceId}/link`, portal.session, {});
  expect(errorCode(unissued)).toBe('PORTAL_NOT_FOUND');
  const detailPath = `${path}/${invoiceId}`;
  const draft = await scenario.get(detailPath, actors.finance.session);
  expect(draft.status, draft.text).toBe(200);
  expect(invoiceDetailEnvelopeSchema.parse(draft.body).data).toMatchObject({
    status: 'requested',
    total: null,
    balance: null,
    issue_date: null,
    due_date: null,
  });
  expect((await scenario.get(detailPath, actors.financeOther.session)).status).toBe(404);
  await approveInvoice(actors.finance, detailPath);
  await postFiscalInvoice(actors.finance, detailPath, actors.fiscalFileId);
  return { invoiceId, detailPath };
}

async function approveInvoice(finance: Person, detailPath: string): Promise<void> {
  const response = await scenario
    .post(`${detailPath}/approval`, finance.session, {})
    .set('If-Match', '"1"')
    .set('Idempotency-Key', crypto.randomUUID());
  expect(response.status).toBe(204);
}

async function postFiscalInvoice(
  finance: Person,
  detailPath: string,
  fiscalFileId: string,
): Promise<void> {
  const response = await scenario
    .post(`${detailPath}/fiscal-document`, finance.session, {
      issue_date: scenario.day(0),
      due_date: scenario.day(30),
      subtotal: '1000.00',
      tax_rate: '19.00',
      tax_total: '190.00',
      withholding_total: '0.00',
      total: '1190.00',
      fiscal_number: 'FE-B31-1001',
      fiscal_uuid: null,
      fiscal_file_id: fiscalFileId,
    })
    .set('If-Match', '"2"')
    .set('Idempotency-Key', crypto.randomUUID());
  expect(response.status).toBe(204);
}

async function registerSettlement(
  finance: Person,
  creditFileId: string,
  detailPath: string,
): Promise<{ noteId: string; paymentId: string }> {
  const note = await keyed(finance, `${detailPath}/credit-notes`, {
    reason: 'Ajuste parcial de prueba',
    amount: '200.00',
    issue_date: scenario.day(0),
    fiscal_number: 'NC-B31-1001',
    fiscal_uuid: null,
    fiscal_file_id: creditFileId,
  });
  expect(note.status, note.text).toBe(201);
  const noteId = invoiceCreatedResponseSchema.parse(note.body).id;
  const payment = await keyed(finance, `${detailPath}/payments`, {
    paid_on: scenario.day(0),
    amount: '990.00',
    method: 'Transferencia',
    reference: 'TR-B31-1001',
    support_file_id: null,
  });
  expect(payment.status, payment.text).toBe(201);
  return { noteId, paymentId: invoiceCreatedResponseSchema.parse(payment.body).id };
}

async function assertInvoiceAccounting(
  actors: Actors,
  invoice: { invoiceId: string; detailPath: string },
  settlement: { noteId: string; paymentId: string },
): Promise<void> {
  const detail = invoiceDetailEnvelopeSchema.parse(
    (await scenario.get(invoice.detailPath, actors.finance.session)).body,
  ).data;
  expect(detail).toMatchObject({
    requested_amount: '1000.00',
    subtotal: '1000.00',
    tax_total: '190.00',
    total: '1190.00',
    paid_total: '990.00',
    balance: '0.00',
    status: 'paid',
    credit_notes: [{ id: settlement.noteId, amount: '200.00', fiscal_number: 'NC-B31-1001' }],
  });
  expect(detail.items[0]?.tax_rate).toBe('19.00');
  await assertAuditTrail(invoice.invoiceId, settlement);
}

async function assertAuditTrail(
  invoiceId: string,
  settlement: { noteId: string; paymentId: string },
): Promise<void> {
  expect(await auditActions(scenario.db, scenario.tenant.id, invoiceId)).toEqual([
    'finance.invoice.request:success',
    'finance.invoice.approve:success',
    'finance.invoice.register_fiscal:success',
  ]);
  expect(await auditActions(scenario.db, scenario.tenant.id, settlement.noteId)).toEqual([
    'finance.credit_note.register:success',
  ]);
  expect(await auditActions(scenario.db, scenario.tenant.id, settlement.paymentId)).toEqual([
    'finance.payment.record:success',
  ]);
}

async function assertPortalInvoice(
  partyId: string,
  invoiceId: string,
  noteId: string,
): Promise<Person> {
  const portal = await scenario.readyPerson('CLIENTE_ADMIN', partyId);
  const invoices = portalInvoiceListSchema.parse(
    (await scenario.get('/v1/portal/invoices', portal.session)).body,
  );
  expect(invoices.data).toMatchObject([
    {
      id: invoiceId,
      fiscal_number: 'FE-B31-1001',
      credit_notes: [{ id: noteId, fiscal_number: 'NC-B31-1001' }],
    },
  ]);
  expect(
    (await scenario.post(`/v1/portal/invoices/${invoiceId}/link`, portal.session, {})).status,
  ).toBe(201);
  expect(
    (
      await scenario.post(
        `/v1/portal/invoices/${invoiceId}/credit-notes/${noteId}/link`,
        portal.session,
        {},
      )
    ).status,
  ).toBe(201);
  return portal;
}

async function assertPortalIsolation(
  _portal: Person,
  sales: Person,
  invoiceId: string,
  noteId: string,
): Promise<void> {
  const otherPartyId = await scenario.client(sales);
  const unrelatedPortal = await scenario.readyPerson('CLIENTE_ADMIN', otherPartyId);
  const invoices = portalInvoiceListSchema.parse(
    (await scenario.get('/v1/portal/invoices', unrelatedPortal.session)).body,
  );
  expect(invoices.data).toEqual([]);
  const hidden = await scenario.post(
    `/v1/portal/invoices/${invoiceId}/credit-notes/${noteId}/link`,
    unrelatedPortal.session,
    {},
  );
  expect(hidden.status).toBe(404);
  expect(errorCode(hidden)).toBe('PORTAL_NOT_FOUND');
  const invoiceLink = await scenario.post(
    `/v1/portal/invoices/${invoiceId}/link`,
    unrelatedPortal.session,
    {},
  );
  expect(invoiceLink.status).toBe(404);
  const reader = await scenario.readyPerson('CLIENTE_USUARIO', otherPartyId);
  expect((await scenario.get('/v1/portal/invoices', reader.session)).status).toBe(403);
}
