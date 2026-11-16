import { expect, it } from 'vitest';

import { day, signedCopy } from '../audit/support/contract-steps.js';
import { issued } from '../audit/support/finance-route-calls.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { FIN, createdId, keyed } from './support/ledger-steps.js';

const s = new AccessScenario('finanzas exportación fiscal');

it('exporta la factura emitida, la nota crédito y el recaudo del mes', async () => {
  const { finance, invoiceId } = await issued(s);
  const path = `${FIN}/invoices/${invoiceId}`;
  const today = day(s, 0);
  await createdId(
    keyed(s, finance, `${path}/credit-notes`, {
      reason: 'Ajuste de prueba',
      amount: '25.00',
      issue_date: today,
      fiscal_number: 'NC-EXPORT-01',
      fiscal_uuid: null,
      fiscal_file_id: await signedCopy(s, finance),
    }),
  );
  await createdId(
    keyed(s, finance, `${path}/payments`, {
      paid_on: today,
      amount: '50.00',
      method: 'Transferencia',
      reference: 'TR-EXPORT-01',
      support_file_id: null,
    }),
  );
  const file = await s.post(`${FIN}/exports/accounting`, finance.session, {
    period: today.slice(0, 7),
  });
  expect(file.status, file.text).toBe(200);
  expect(file.text).toContain('NC-EXPORT-01');
  expect(file.text).toMatch(/RECAUDO;[^\r\n]*;50,00;/u);
  expect(file.text).toContain('TR-EXPORT-01');
  expect(file.text).toMatch(/NOTA_CREDITO;[^\r\n]*;25,00;/u);
});
