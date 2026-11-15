import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { costCenterRefs, toCalendarDate } from '../../core/index.js';
import { financeParties, type FinanceParty } from '../../party/index.js';
import type { AccountingRow } from '../domain/accounting-csv.js';
import { periodRange } from '../domain/ledger-rules.js';
import { dateColumn } from './ledger-support.js';

// Movimientos de un mes para el archivo contable (B32, decisión 1): facturas emitidas, notas
// crédito, recaudos, gastos aprobados y movimientos de caja menor, cada uno con su fecha contable.

const PETTY_CASH_TEXT: Readonly<Record<string, string>> = {
  opening: 'Apertura',
  voucher: 'Vale',
  replenishment: 'Reembolso',
};

const NO_COST = { costCenter: null, category: null } as const;

interface Range {
  readonly gte: Date;
  readonly lte: Date;
}

type Parties = Map<string, FinanceParty>;

function rangeOf(period: string): Range {
  const { from, to } = periodRange(period);
  return { gte: dateColumn(from), lte: dateColumn(to) };
}

function partyCells(party: FinanceParty | undefined): Pick<AccountingRow, 'taxId' | 'party'> {
  return { taxId: party?.taxId ?? null, party: party?.name ?? null };
}

async function invoiceRows(tx: TenantTransaction, range: Range): Promise<AccountingRow[]> {
  const invoices = await tx.finInvoice.findMany({
    where: { deletedAt: null, status: { not: 'voided' }, issueDate: range },
  });
  const parties: Parties = await financeParties(
    tx,
    invoices.map((invoice) => invoice.partyId),
  );
  return invoices.flatMap((invoice): AccountingRow[] =>
    invoice.issueDate === null || invoice.total === null
      ? []
      : [
          {
            date: toCalendarDate(invoice.issueDate),
            type: 'invoice',
            number: invoice.fiscalNumber ?? invoice.code,
            ...partyCells(parties.get(invoice.partyId)),
            ...NO_COST,
            amount: invoice.total.toFixed(2),
            reference: invoice.code,
          },
        ],
  );
}

async function creditNoteRows(tx: TenantTransaction, range: Range): Promise<AccountingRow[]> {
  const notes = await tx.finCreditNote.findMany({
    where: { deletedAt: null, issueDate: range },
    include: { invoice: true },
  });
  const parties = await financeParties(
    tx,
    notes.map((note) => note.invoice.partyId),
  );
  return notes.map((note) => ({
    date: toCalendarDate(note.issueDate),
    type: 'credit_note',
    number: note.fiscalNumber,
    ...partyCells(parties.get(note.invoice.partyId)),
    ...NO_COST,
    amount: note.amount.toFixed(2),
    reference: note.invoice.fiscalNumber ?? note.invoice.code,
  }));
}

async function paymentRows(tx: TenantTransaction, range: Range): Promise<AccountingRow[]> {
  const payments = await tx.finPayment.findMany({
    where: { deletedAt: null, paidOn: range },
    include: { invoice: true },
  });
  const parties = await financeParties(
    tx,
    payments.map((payment) => payment.invoice.partyId),
  );
  return payments.map((payment) => ({
    date: toCalendarDate(payment.paidOn),
    type: 'payment',
    number: payment.invoice.fiscalNumber ?? payment.invoice.code,
    ...partyCells(parties.get(payment.invoice.partyId)),
    ...NO_COST,
    amount: payment.amount.toFixed(2),
    reference: [payment.method, payment.reference ?? ''].filter((part) => part !== '').join(' · '),
  }));
}

async function centerCodes(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<(id: string | null) => string | null> {
  const centers = await costCenterRefs(
    tx,
    ids.flatMap((id) => (id === null ? [] : [id])),
  );
  return (id) => (id === null ? null : (centers.get(id)?.code ?? null));
}

async function expenseRows(tx: TenantTransaction, range: Range): Promise<AccountingRow[]> {
  const expenses = await tx.finExpense.findMany({
    where: { deletedAt: null, status: 'approved', expenseDate: range },
  });
  const parties = await financeParties(
    tx,
    expenses.flatMap((expense) => (expense.supplierId === null ? [] : [expense.supplierId])),
  );
  const centerCode = await centerCodes(
    tx,
    expenses.map((expense) => expense.costCenterId),
  );
  return expenses.map((expense) => ({
    date: toCalendarDate(expense.expenseDate),
    type: 'expense',
    number: expense.code,
    ...partyCells(expense.supplierId === null ? undefined : parties.get(expense.supplierId)),
    costCenter: centerCode(expense.costCenterId),
    category: expense.category,
    amount: expense.amount.toFixed(2),
    reference: expense.description,
  }));
}

async function pettyCashRows(tx: TenantTransaction, range: Range): Promise<AccountingRow[]> {
  const movements = await tx.finPettyCash.findMany({
    where: { deletedAt: null, movementDate: range },
  });
  const centerCode = await centerCodes(
    tx,
    movements.map((row) => row.costCenterId),
  );
  return movements.map((row) => ({
    date: toCalendarDate(row.movementDate),
    type: 'petty_cash',
    number: row.code,
    taxId: null,
    party: null,
    costCenter: centerCode(row.costCenterId),
    category: row.category,
    amount: row.amount.toFixed(2),
    reference: `${PETTY_CASH_TEXT[row.type] ?? row.type}: ${row.concept}`,
  }));
}

const TYPE_ORDER = ['invoice', 'credit_note', 'payment', 'expense', 'petty_cash'];

/** Todos los movimientos del mes, en orden de fecha, tipo y número: el mismo mes da el mismo archivo. */
export async function accountingRows(
  tx: TenantTransaction,
  period: string,
): Promise<AccountingRow[]> {
  const range = rangeOf(period);
  const rows: AccountingRow[] = [];
  for (const source of [invoiceRows, creditNoteRows, paymentRows, expenseRows, pettyCashRows]) {
    rows.push(...(await source(tx, range)));
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
      a.number.localeCompare(b.number),
  );
}
