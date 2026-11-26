import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';

// Cifras de Finanzas para el tablero gerencial (B46, decisión 2). Ventas: subtotal (sin IVA) de
// las facturas emitidas en el periodo menos la parte sin IVA de las notas crédito del periodo.
// Cartera: el saldo de cada factura emitida o con abono (total menos recaudos y notas crédito),
// la misma cuenta que muestra el listado de facturas.

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const ZERO = new Money(0);
const SOLD = ['issued', 'partially_paid', 'paid'];
const OPEN = ['issued', 'partially_paid'];

export interface FinanceFigureRow {
  readonly id: string;
  readonly code: string;
  readonly client: string;
  readonly date: string | null;
  readonly amount: string;
}

export interface FinanceFigure {
  readonly total: string;
  readonly rows: readonly FinanceFigureRow[];
}

interface Period {
  readonly from: string;
  readonly to: string;
}

function dateRange(period: Period) {
  return { gte: fromCalendarDate(period.from), lte: fromCalendarDate(period.to) };
}

async function clientNames(tx: TenantTransaction, ids: readonly string[]) {
  const parties = await commercialParties(tx, [...new Set(ids)]);
  return (id: string) => parties.get(id)?.name ?? 'Cliente';
}

/** Parte sin IVA de una nota crédito: su valor por la proporción subtotal ÷ total. */
function untaxed(amount: Decimal.Value, subtotal: Decimal.Value, total: Decimal.Value): Decimal {
  const base = new Money(total.toString());
  if (base.isZero()) return ZERO;
  return new Money(amount.toString()).times(subtotal.toString()).dividedBy(base).toDecimalPlaces(2);
}

/** Las facturas vendidas y las notas crédito del periodo. */
function soldDocuments(tx: TenantTransaction, period: Period) {
  return Promise.all([
    tx.finInvoice.findMany({
      where: { status: { in: SOLD }, issueDate: dateRange(period), deletedAt: null },
      orderBy: [{ issueDate: 'asc' }, { code: 'asc' }],
    }),
    tx.finCreditNote.findMany({
      where: {
        issueDate: dateRange(period),
        deletedAt: null,
        invoice: { status: { in: SOLD }, deletedAt: null },
      },
      include: { invoice: { select: { code: true, partyId: true, subtotal: true, total: true } } },
      orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
    }),
  ]);
}

/** Ventas facturadas del periodo, con las facturas y las notas crédito que las componen. */
export async function salesFigure(tx: TenantTransaction, period: Period): Promise<FinanceFigure> {
  const [invoices, notes] = await soldDocuments(tx, period);
  const name = await clientNames(tx, [
    ...invoices.map((row) => row.partyId),
    ...notes.map((row) => row.invoice.partyId),
  ]);
  const invoiceRows = invoices.map((row) => ({
    id: row.id,
    code: row.code,
    client: name(row.partyId),
    date: row.issueDate === null ? null : toCalendarDate(row.issueDate),
    amount: new Money((row.subtotal ?? 0).toString()),
  }));
  const noteRows = notes.map((row) => ({
    id: row.id,
    code: `Nota crédito ${row.fiscalNumber} (${row.invoice.code})`,
    client: name(row.invoice.partyId),
    date: toCalendarDate(row.issueDate),
    amount: untaxed(row.amount, row.invoice.subtotal ?? 0, row.invoice.total ?? 0).negated(),
  }));
  const rows = [...invoiceRows, ...noteRows];
  const total = rows.reduce((sum, row) => sum.plus(row.amount), ZERO);
  return {
    total: total.toFixed(2),
    rows: rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
  };
}

async function sumsByInvoice(
  tx: TenantTransaction,
  invoiceIds: readonly string[],
): Promise<Map<string, Decimal>> {
  const where = { invoiceId: { in: [...invoiceIds] }, deletedAt: null };
  const [payments, notes] = await Promise.all([
    tx.finPayment.findMany({ where, select: { invoiceId: true, amount: true } }),
    tx.finCreditNote.findMany({ where, select: { invoiceId: true, amount: true } }),
  ]);
  const totals = new Map<string, Decimal>();
  for (const row of [...payments, ...notes]) {
    totals.set(row.invoiceId, (totals.get(row.invoiceId) ?? ZERO).plus(row.amount.toString()));
  }
  return totals;
}

export interface ReceivableFigures {
  readonly open: FinanceFigure;
  readonly overdue: FinanceFigure;
}

/** Cartera por cobrar y la parte vencida a la fecha. */
export async function receivableFigures(
  tx: TenantTransaction,
  today: string,
): Promise<ReceivableFigures> {
  const invoices = await tx.finInvoice.findMany({
    where: { status: { in: OPEN }, deletedAt: null },
    orderBy: [{ dueDate: 'asc' }, { code: 'asc' }],
  });
  const [reduced, name] = await Promise.all([
    sumsByInvoice(
      tx,
      invoices.map((row) => row.id),
    ),
    clientNames(
      tx,
      invoices.map((row) => row.partyId),
    ),
  ]);
  const rows = invoices.flatMap((row) => {
    const balance = Money.max(
      new Money((row.total ?? 0).toString()).minus(reduced.get(row.id) ?? ZERO),
      ZERO,
    );
    if (balance.isZero()) return [];
    const date = row.dueDate === null ? null : toCalendarDate(row.dueDate);
    return [{ id: row.id, code: row.code, client: name(row.partyId), date, amount: balance }];
  });
  const overdueRows = rows.filter((row) => row.date !== null && row.date < today);
  const figure = (items: typeof rows): FinanceFigure => ({
    total: items.reduce((sum, row) => sum.plus(row.amount), ZERO).toFixed(2),
    rows: items.map((row) => ({ ...row, amount: row.amount.toFixed(2) })),
  });
  return { open: figure(rows), overdue: figure(overdueRows) };
}
