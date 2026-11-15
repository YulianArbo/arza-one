import { Decimal } from 'decimal.js';
import {
  exportBatchListResponseSchema,
  financePeriodListResponseSchema,
  invoiceCreatedResponseSchema,
} from '@arza/contracts';
import type { Response } from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { day } from '../audit/support/contract-steps.js';
import { issued } from '../audit/support/finance-route-calls.js';
import {
  FIN,
  createdId,
  expenseBody,
  keyed,
  ledgerBasics,
  monthsBefore,
  movementBody,
  versioned,
} from './support/ledger-steps.js';

// B32: un periodo cerrado no admite cambios y lo exportado coincide con lo registrado. El mes de
// prueba es de hace dos meses; la empresa de la prueba es nueva, así que el mes solo tiene lo que
// se registra aquí. Datos ficticios.

const s = new AccessScenario('finanzas cierre y exportación');

interface World {
  finance: Person;
  approver: Person;
  costCenterId: string;
  period: string;
  pendingId: string;
  batchId: string;
}

let prepared: World | undefined;

function world(): World {
  if (prepared === undefined) throw new Error('El escenario del cierre no está preparado');
  return prepared;
}

function on(dayOfMonth: string): string {
  return `${world().period}-${dayOfMonth}`;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

async function prepare(): Promise<void> {
  const { costCenterId } = await ledgerBasics(s);
  prepared = {
    finance: await s.person('finanzas-cierre', ['ADMIN_FINANCIERO']),
    approver: await s.person('aprobador-cierre', ['ADMIN_FINANCIERO']),
    costCenterId,
    period: monthsBefore(day(s, 0), 2),
    pendingId: '',
    batchId: '',
  };
}

/** Un gasto aprobado, uno pendiente y tres movimientos de caja menor en el mes de prueba. */
async function recordMonth(): Promise<void> {
  const { finance, approver, costCenterId } = world();
  const approved = await createdId(
    keyed(
      s,
      finance,
      `${FIN}/expenses`,
      await expenseBody(s, finance, costCenterId, on('08'), '120000.50'),
    ),
  );
  await versioned(s.post(`${FIN}/expenses/${approved}/approval`, approver.session), 1).expect(204);
  world().pendingId = await createdId(
    keyed(
      s,
      finance,
      `${FIN}/expenses`,
      await expenseBody(s, finance, costCenterId, on('09'), '999.00'),
    ),
  );
  const path = `${FIN}/petty-cash/movements`;
  await createdId(keyed(s, finance, path, movementBody('opening', '400000.00', on('05'))));
  await createdId(
    keyed(s, finance, path, movementBody('voucher', '35000.25', on('12'), costCenterId)),
  );
  await createdId(keyed(s, finance, path, movementBody('replenishment', '35000.25', on('20'))));
}

async function refusesToCloseWithPending(): Promise<void> {
  const { finance, approver, period } = world();
  const body = { period };
  expectError(
    await s.post(`${FIN}/periods/close`, finance.session, body),
    409,
    'FIN_PERIOD_NOT_CLOSABLE',
  );
  const periods = financePeriodListResponseSchema.parse(
    (await s.get(`${FIN}/periods`, finance.session)).body,
  );
  expect(periods.data.find((row) => row.period === period)).toMatchObject({
    status: 'open',
    closable: false,
    pending_expenses: 1,
  });
  const reason = { reason: 'Gasto duplicado en la prueba' };
  const rejection = s.post(
    `${FIN}/expenses/${world().pendingId}/rejection`,
    approver.session,
    reason,
  );
  await versioned(rejection, 1).expect(204);
  const current = { period: day(s, 0).slice(0, 7) };
  expectError(
    await s.post(`${FIN}/periods/close`, finance.session, current),
    409,
    'FIN_PERIOD_NOT_CLOSABLE',
  );
}

async function closesAndExports(): Promise<void> {
  const accountant = await s.person('contador-cierre', ['CONTADOR']);
  world().batchId = await createdId(
    s.post(`${FIN}/periods/close`, accountant.session, { period: world().period }),
  );
  expectError(
    await s.post(`${FIN}/periods/close`, accountant.session, { period: world().period }),
    409,
    'FIN_PERIOD_NOT_CLOSABLE',
  );
  expect(await auditActions(s.db, s.tenant.id, world().batchId)).toEqual([
    'finance.period.close:success',
  ]);
}

/** Suma por tipo leída del archivo: columna «tipo» y «valor» con coma decimal. */
function sumsFromCsv(csv: string): Record<string, string> {
  const [, ...lines] = csv.replace('﻿', '').trim().split('\r\n');
  const sums = new Map<string, Decimal>();
  for (const line of lines) {
    const cells = line.split(';');
    const type = cells[1] ?? '';
    sums.set(type, (sums.get(type) ?? new Decimal(0)).plus((cells[7] ?? '0').replace(',', '.')));
  }
  return Object.fromEntries([...sums].map(([type, sum]) => [type, sum.toFixed(2)]));
}

async function registeredSums(): Promise<Record<string, string>> {
  const range = { gte: new Date(`${on('01')}T00:00:00Z`), lte: new Date(`${on('28')}T00:00:00Z`) };
  const [expenses, cash] = await s.inTenant((tx) =>
    Promise.all([
      tx.finExpense.aggregate({
        where: { status: 'approved', expenseDate: range },
        _sum: { amount: true },
      }),
      tx.finPettyCash.aggregate({ where: { movementDate: range }, _sum: { amount: true } }),
    ]),
  );
  return {
    GASTO: new Decimal(expenses._sum.amount?.toString() ?? '0').toFixed(2),
    CAJA_MENOR: new Decimal(cash._sum.amount?.toString() ?? '0').toFixed(2),
  };
}

async function exportMatchesRecords(): Promise<void> {
  const { finance } = world();
  const file = await s.get(`${FIN}/exports/${world().batchId}/file`, finance.session);
  expect(file.status, file.text).toBe(200);
  expect(file.headers['content-type']).toContain('text/csv');
  expect(sumsFromCsv(file.text)).toEqual(await registeredSums());
  expect(sumsFromCsv(file.text)).toEqual({ GASTO: '120000.50', CAJA_MENOR: '470000.50' });
  const again = await s.post(`${FIN}/exports/accounting`, finance.session, {
    period: world().period,
  });
  expect(again.text).toBe(file.text);
  const batches = exportBatchListResponseSchema.parse(
    (await s.get(`${FIN}/exports`, finance.session)).body,
  );
  expect(batches.data.find((batch) => batch.id === world().batchId)).toMatchObject({
    kind: 'definitive',
    row_count: 4,
    totals: { expense: '120000.50', petty_cash: '470000.50', invoice: '0.00' },
  });
}

async function closedPeriodRejectsChanges(): Promise<void> {
  const { finance, costCenterId } = world();
  const missing = await s.get(`${FIN}/exports/${uuidv7()}/file`, finance.session);
  expect(missing.status, missing.text).toBe(404);
  const movement = movementBody('voucher', '1.00', on('17'), costCenterId);
  const response = await keyed(s, finance, `${FIN}/petty-cash/movements`, movement);
  expectError(response, 409, 'FIN_PERIOD_CLOSED');
  const expense = await expenseBody(s, finance, costCenterId, on('15'));
  expectError(await keyed(s, finance, `${FIN}/expenses`, expense), 409, 'FIN_PERIOD_CLOSED');
  const reconciliation = {
    account: 'Banco ficticio ···9876',
    period: world().period,
    book_balance: '1.00',
    bank_balance: '1.00',
    differences: [],
  };
  const created = await s.post(`${FIN}/bank-reconciliations`, finance.session, reconciliation);
  expectError(created, 409, 'FIN_PERIOD_CLOSED');
  const { finance: billing, invoiceId } = await issued(s);
  const payment = {
    paid_on: on('15'),
    amount: '10.00',
    method: 'Transferencia',
    reference: null,
    support_file_id: null,
  };
  const paid = await keyed(s, billing, `${FIN}/invoices/${invoiceId}/payments`, payment);
  expectError(paid, 409, 'FIN_PERIOD_CLOSED');
}

async function databaseRejectsClosedPeriod(): Promise<void> {
  const write = s.inTenant((tx) =>
    tx.finPettyCash.create({
      data: {
        tenantId: s.tenant.id,
        code: 'CM-DIRECTO',
        movementDate: new Date(`${on('25')}T00:00:00Z`),
        type: 'replenishment',
        amount: '1.00',
        concept: 'Escritura directa de prueba',
        balance: '1.00',
        requestKey: crypto.randomUUID(),
      },
    }),
  );
  await expect(write).rejects.toThrow(/cerrado/u);
}

async function preliminaryExport(): Promise<void> {
  const { finance } = world();
  const current = day(s, 0).slice(0, 7);
  const file = await s.post(`${FIN}/exports/accounting`, finance.session, { period: current });
  expect(file.status, file.text).toBe(200);
  expect(file.text.split('\r\n')[0]).toContain('fecha;tipo;numero');
  const batchId = String(file.headers['x-export-batch-id']);
  expect(invoiceCreatedResponseSchema.safeParse({ id: batchId }).success).toBe(true);
  expectError(
    await s.get(`${FIN}/exports/${batchId}/file`, finance.session),
    409,
    'FIN_STATUS_INVALID',
  );
  const collaborator = await s.person('colaborador-cierre', ['COLABORADOR']);
  expect(
    (await s.post(`${FIN}/exports/accounting`, collaborator.session, { period: current })).status,
  ).toBe(403);
  expect(
    (await s.post(`${FIN}/periods/close`, collaborator.session, { period: current })).status,
  ).toBe(403);
}

async function isolatedBatches(): Promise<void> {
  const outsider = await s.person('contador-otra', ['CONTADOR'], { tenantId: s.otherTenant.id });
  expect((await s.get(`${FIN}/exports/${world().batchId}/file`, outsider.session)).status).toBe(
    404,
  );
  const batches = exportBatchListResponseSchema.parse(
    (await s.get(`${FIN}/exports`, outsider.session)).body,
  );
  expect(batches.data).toEqual([]);
}

async function refusesMismatchedExport(): Promise<void> {
  const { finance, period } = world();
  const fixture = await s.inTenant((tx) =>
    tx.finExportBatch.create({
      data: {
        tenantId: s.tenant.id,
        period: monthsBefore(`${period}-01`, 1),
        kind: 'definitive',
        rowCount: 0,
        totals: {},
        checksum: '0'.repeat(64),
        fileName: 'prueba.csv',
        exportedBy: finance.id,
        exportedAt: s.clock.now(),
      },
    }),
  );
  expectError(
    await s.get(`${FIN}/exports/${fixture.id}/file`, finance.session),
    409,
    'FIN_STATUS_INVALID',
  );
}

describe('cierre de periodo y exportación contable (B32)', () => {
  it('no cierra un mes con gastos sin decidir ni el mes en curso', async () => {
    await prepare();
    await recordMonth();
    await refusesToCloseWithPending();
  });

  it('el Contador cierra el mes y queda su lote definitivo auditado', async () => {
    await closesAndExports();
  });

  it('lo exportado coincide con lo registrado y se descarga idéntico', async () => {
    await exportMatchesRecords();
  });

  it('un periodo cerrado no admite cambios, tampoco en recaudos', async () => {
    await closedPeriodRejectsChanges();
  });

  it('la base de datos rechaza la escritura aunque el código se equivoque', async () => {
    await databaseRejectsClosedPeriod();
  });

  it('un mes abierto se exporta como preliminar; sin permiso responde 403', async () => {
    await preliminaryExport();
  });

  it('otra empresa no ve los lotes', async () => {
    await isolatedBatches();
  });

  it('rechaza una descarga definitiva cuando no coincide la huella del lote', async () => {
    await refusesMismatchedExport();
  });
});
