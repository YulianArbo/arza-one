import { invoiceCreatedResponseSchema } from '@arza/contracts';
import { expect } from 'vitest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { created, day, signedCopy } from './contract-steps.js';
import { running, type RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para Finanzas (B31): la solicitud desde un hito, su
// aprobación, el registro del documento fiscal, las notas crédito, los recaudos y la anulación.
// Cada una prepara por la API un proyecto en ejecución con un hito facturable. Datos ficticios.

const MILESTONE = (s: AccessScenario) => ({
  name: 'Hito facturable',
  due_on: day(s, 30),
  billing_pct: 25,
});

function keyed(s: AccessScenario, person: Person, path: string, body: object) {
  return s.post(path, person.session, body).set('Idempotency-Key', crypto.randomUUID());
}

/** Un hito facturable de un proyecto en ejecución y la persona de Finanzas que lo cobra. */
async function billable(s: AccessScenario): Promise<{ finance: Person; milestoneId: string }> {
  const crew = await running(s);
  const milestoneId = await created(
    s.post(`${crew.base}/milestones`, crew.leader.session, MILESTONE(s)),
  );
  await s.inTenant((tx) =>
    tx.prjMilestone.update({
      where: { id: milestoneId },
      data: {
        status: 'billable',
        doneAt: s.clock.now(),
        billableAt: s.clock.now(),
        billableAmount: '1000.00',
      },
    }),
  );
  return { finance: await s.person('finanzas-recorrido', ['ADMIN_FINANCIERO']), milestoneId };
}

/** Una solicitud de factura creada, todavía pendiente de aprobación. */
async function requested(s: AccessScenario, finance: Person, milestoneId: string): Promise<string> {
  const issued = await keyed(s, finance, '/v1/finance/invoices', { milestone_id: milestoneId });
  expect(issued.status, issued.text).toBe(201);
  return invoiceCreatedResponseSchema.parse(issued.body).id;
}

async function approve(s: AccessScenario, finance: Person, invoiceId: string): Promise<void> {
  const done = await s
    .post(`/v1/finance/invoices/${invoiceId}/approval`, finance.session, {})
    .set('If-Match', '"1"')
    .set('Idempotency-Key', crypto.randomUUID());
  expect(done.status, done.text).toBe(204);
}

async function registerFiscal(
  s: AccessScenario,
  finance: Person,
  invoiceId: string,
): Promise<void> {
  const done = await s
    .post(`/v1/finance/invoices/${invoiceId}/fiscal-document`, finance.session, {
      issue_date: day(s, 0),
      due_date: day(s, 30),
      subtotal: '1000.00',
      tax_rate: '19.00',
      tax_total: '190.00',
      withholding_total: '0.00',
      total: '1190.00',
      fiscal_number: `FE-REC-${crypto.randomUUID().slice(0, 8)}`,
      fiscal_uuid: null,
      fiscal_file_id: await signedCopy(s, finance),
    })
    .set('If-Match', '"2"')
    .set('Idempotency-Key', crypto.randomUUID());
  expect(done.status, done.text).toBe(204);
}

/** Una factura emitida: solicitada, aprobada y con su documento fiscal registrado. */
export async function issued(s: AccessScenario): Promise<{ finance: Person; invoiceId: string }> {
  const { finance, milestoneId } = await billable(s);
  const invoiceId = await requested(s, finance, milestoneId);
  await approve(s, finance, invoiceId);
  await registerFiscal(s, finance, invoiceId);
  return { finance, invoiceId };
}

export const FINANCE_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/finance/invoices': async (s) => {
    const { finance, milestoneId } = await billable(s);
    return { test: keyed(s, finance, '/v1/finance/invoices', { milestone_id: milestoneId }) };
  },
  'POST /v1/finance/invoices/{id}/approval': async (s) => {
    const { finance, milestoneId } = await billable(s);
    const invoiceId = await requested(s, finance, milestoneId);
    return {
      test: s
        .post(`/v1/finance/invoices/${invoiceId}/approval`, finance.session, {})
        .set('If-Match', '"1"')
        .set('Idempotency-Key', crypto.randomUUID()),
    };
  },
  'POST /v1/finance/invoices/{id}/fiscal-document': async (s) => {
    const { finance, milestoneId } = await billable(s);
    const invoiceId = await requested(s, finance, milestoneId);
    await approve(s, finance, invoiceId);
    return {
      test: s
        .post(`/v1/finance/invoices/${invoiceId}/fiscal-document`, finance.session, {
          issue_date: day(s, 0),
          due_date: day(s, 30),
          subtotal: '1000.00',
          tax_rate: '19.00',
          tax_total: '190.00',
          withholding_total: '0.00',
          total: '1190.00',
          fiscal_number: `FE-REC-${crypto.randomUUID().slice(0, 8)}`,
          fiscal_uuid: null,
          fiscal_file_id: await signedCopy(s, finance),
        })
        .set('If-Match', '"2"')
        .set('Idempotency-Key', crypto.randomUUID()),
    };
  },
  'POST /v1/finance/invoices/{id}/credit-notes': async (s) => {
    const { finance, invoiceId } = await issued(s);
    return {
      test: keyed(s, finance, `/v1/finance/invoices/${invoiceId}/credit-notes`, {
        reason: 'Ajuste del recorrido de auditoría',
        amount: '200.00',
        issue_date: day(s, 0),
        fiscal_number: `NC-REC-${crypto.randomUUID().slice(0, 8)}`,
        fiscal_uuid: null,
        fiscal_file_id: await signedCopy(s, finance),
      }),
    };
  },
  'POST /v1/finance/invoices/{id}/payments': async (s) => {
    const { finance, invoiceId } = await issued(s);
    return {
      test: keyed(s, finance, `/v1/finance/invoices/${invoiceId}/payments`, {
        paid_on: day(s, 0),
        amount: '990.00',
        method: 'Transferencia',
        reference: `TR-REC-${crypto.randomUUID().slice(0, 8)}`,
        support_file_id: null,
      }),
    };
  },
  'POST /v1/finance/invoices/{id}/void': async (s) => {
    const { finance, milestoneId } = await billable(s);
    const invoiceId = await requested(s, finance, milestoneId);
    return {
      test: s
        .post(`/v1/finance/invoices/${invoiceId}/void`, finance.session, {
          reason: 'Solicitud duplicada del recorrido',
        })
        .set('If-Match', '"1"'),
    };
  },
};
