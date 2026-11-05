import {
  largestDiscount,
  quoteStatusSchema,
  quoteTotals,
  serviceUnitSchema,
  type QuoteItemRequest,
  type QuoteLineTotals,
  type QuoteStatus,
  type UpdateQuoteRequest,
} from '@arza/contracts';

import type { CrmQuote, CrmQuoteItem, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { taxRatesOn } from '../../fin/index.js';
import { moneyText } from '../domain/money.js';
import { isPastValidity } from '../domain/quote-rules.js';
import {
  crmNotFound,
  serviceInvalid,
  statusInvalid,
  taxInvalid,
  validUntilInvalid,
} from './crm-messages.js';

// Lectura y escritura de una cotización con su versión (B23), comunes a los casos de uso. Los
// totales se calculan siempre aquí, con la tarifa vigente de cada impuesto, nunca se reciben.

export const QUOTE_SEQUENCE = 'crm.quote';
export const QUOTES = { name: 'Cotizaciones', prefix: 'COT', padding: 4 } as const;

export async function findQuote(tx: TenantTransaction, id: string): Promise<CrmQuote> {
  const quote = await tx.crmQuote.findFirst({ where: { id, deletedAt: null } });
  if (quote === null) throw crmNotFound('La cotización');
  return quote;
}

export function statusOf(quote: CrmQuote): QuoteStatus {
  return quoteStatusSchema.parse(quote.status);
}

/** La cotización está en uno de los estados que permiten el paso. */
export function assertQuoteStatus(
  quote: CrmQuote,
  allowed: readonly QuoteStatus[],
  detail: string,
): void {
  if (!allowed.includes(statusOf(quote))) throw statusInvalid(detail);
}

export async function updateQuoteVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.CrmQuoteUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.crmQuote.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría de la cotización. */
export function quoteAudit(quote: CrmQuote): Record<string, string | number | null> {
  return {
    code: quote.code,
    version_number: quote.versionNumber,
    status: quote.status,
    valid_until: toCalendarDate(quote.validUntil),
    subtotal: moneyText(quote.subtotal.toString()),
    discount_total: moneyText(quote.discountTotal.toString()),
    tax_total: moneyText(quote.taxTotal.toString()),
    total: moneyText(quote.total.toString()),
    largest_discount: quote.largestDiscount.toFixed(2),
  };
}

/** Lo que el cálculo deja listo para guardar: las columnas de los ítems y de los totales. */
export interface BuiltDraft {
  readonly items: Omit<Prisma.CrmQuoteItemCreateManyInput, 'tenantId' | 'quoteId'>[];
  readonly totals: {
    readonly subtotal: string;
    readonly discountTotal: string;
    readonly taxTotal: string;
    readonly total: string;
    readonly largestDiscount: string;
  };
}

async function assertServices(tx: TenantTransaction, items: readonly QuoteItemRequest[]) {
  const ids = [
    ...new Set(items.flatMap((item) => (item.service_id === null ? [] : [item.service_id]))),
  ];
  if (ids.length === 0) return;
  const found = await tx.crmService.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw serviceInvalid();
}

type BuiltItem = BuiltDraft['items'][number];

function itemColumns(
  line: QuoteItemRequest & { readonly tax_rate: string },
  computed: QuoteLineTotals,
  position: number,
): BuiltItem {
  return {
    position,
    serviceId: line.service_id,
    description: line.description,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    discountPercent: line.discount_percent,
    taxKey: line.tax_key,
    taxRate: line.tax_rate,
    lineSubtotal: computed.subtotal,
    lineDiscount: computed.discount,
    lineTax: computed.tax,
    lineTotal: computed.total,
  };
}

/** Valida los servicios y los impuestos y calcula cada línea con la tarifa vigente hoy. */
export async function buildDraft(
  tx: TenantTransaction,
  items: readonly QuoteItemRequest[],
  at: Date,
): Promise<BuiltDraft> {
  await assertServices(tx, items);
  const rates = await taxRatesOn(tx, bogotaToday(at));
  const lines = items.map((item) => {
    const rate = rates.get(item.tax_key);
    if (rate === undefined) throw taxInvalid();
    return { ...item, tax_rate: rate.rate };
  });
  const totals = quoteTotals(lines);
  return {
    items: lines.map((line, index) => {
      const computed = totals.lines[index];
      if (computed === undefined) throw new Error('Línea sin calcular');
      return itemColumns(line, computed, index + 1);
    }),
    totals: {
      subtotal: totals.subtotal,
      discountTotal: totals.discount_total,
      taxTotal: totals.tax_total,
      total: totals.total,
      largestDiscount: largestDiscount(lines),
    },
  };
}

/** La vigencia termina hoy o más adelante (en Colombia). */
export function assertValidUntil(validUntil: string, at: Date): void {
  if (isPastValidity(validUntil, bogotaToday(at))) throw validUntilInvalid();
}

type DraftTotals = BuiltDraft['totals'];

interface DraftColumns extends DraftTotals {
  readonly validUntil: Date;
  readonly paymentTerms: string;
  readonly deliveryTerms: string;
  readonly warranty: string | null;
  readonly notes: string | null;
}

/** Columnas del encabezado de un borrador. */
export function draftColumns(input: UpdateQuoteRequest, built: BuiltDraft): DraftColumns {
  return {
    validUntil: fromCalendarDate(input.valid_until),
    paymentTerms: input.conditions.payment_terms,
    deliveryTerms: input.conditions.delivery_terms,
    warranty: input.conditions.warranty,
    notes: input.notes,
    ...built.totals,
  };
}

/** Reemplaza los ítems del borrador: los anteriores quedan borrados lógicamente. */
export async function replaceItems(
  tx: TenantTransaction,
  quote: { readonly id: string; readonly tenantId: string },
  built: BuiltDraft,
  at: Date,
): Promise<void> {
  await tx.crmQuoteItem.updateMany({
    where: { quoteId: quote.id, deletedAt: null },
    data: { deletedAt: at },
  });
  await tx.crmQuoteItem.createMany({
    data: built.items.map((item) => ({ ...item, tenantId: quote.tenantId, quoteId: quote.id })),
  });
}

/** Los ítems vigentes de una cotización, en orden. */
export async function quoteItems(tx: TenantTransaction, quoteId: string): Promise<CrmQuoteItem[]> {
  return tx.crmQuoteItem.findMany({
    where: { quoteId, deletedAt: null },
    orderBy: { position: 'asc' },
  });
}

/** Los ítems guardados, como los pide un borrador: para copiarlos a la versión siguiente. */
export function itemRequestsOf(items: readonly CrmQuoteItem[]): QuoteItemRequest[] {
  return items.map((item) => ({
    service_id: item.serviceId,
    description: item.description,
    unit: serviceUnitSchema.parse(item.unit),
    quantity: item.quantity.toFixed(2),
    unit_price: moneyText(item.unitPrice.toString()),
    discount_percent: item.discountPercent.toFixed(2),
    tax_key: item.taxKey,
  }));
}
