import { SERVICE_UNITS, serviceUnitSchema } from '@arza/contracts';
import {
  institutionalFooter,
  institutionalHeader,
  printPage,
  printedDate,
  quoteDocumentBody,
  type QuoteDocument,
  type QuoteDocumentLine,
} from '@arza/templates';

import type { CrmQuote, CrmQuoteItem } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity, toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import { moneyText } from '../domain/money.js';
import { peopleNames } from './crm-support.js';
import { taxesOf } from './quote-queries.js';
import { quoteItems } from './quote-records.js';

// La Propuesta Comercial FT-COM-001 de una versión (B23), lista para que Gotenberg la convierta a
// PDF con el encabezado y el pie institucionales. Se arma una sola vez, al aprobarse la versión: lo
// que el cliente ve ya no cambia.

const FORMAT = { code: 'FT-COM-001', name: 'PROPUESTA COMERCIAL', version: '01', date: '—' };

/** Lo que Gotenberg necesita para convertir una página HTML (doc/gotenberg-converter). */
export interface QuoteHtml {
  readonly index: string;
  readonly header: string;
  readonly footer: string;
  readonly landscape: boolean;
}

export function quoteFileName(quote: Pick<CrmQuote, 'code' | 'versionNumber'>): string {
  return `${quote.code}-v${String(quote.versionNumber)}.pdf`;
}

function documentLine(item: CrmQuoteItem): QuoteDocumentLine {
  return {
    position: item.position,
    description: item.description,
    unit: SERVICE_UNITS[serviceUnitSchema.parse(item.unit)],
    quantity: item.quantity.toFixed(2),
    unitPrice: moneyText(item.unitPrice.toString()),
    discountPercent: item.discountPercent.toFixed(2),
    taxRate: item.taxRate.toFixed(2),
    lineTotal: moneyText(item.lineTotal.toString()),
  };
}

async function documentOf(
  tx: TenantTransaction,
  quote: CrmQuote,
  at: Date,
): Promise<QuoteDocument> {
  const [company, parties, people, opportunity, items] = await Promise.all([
    companyIdentity(tx),
    commercialParties(tx, [quote.partyId]),
    peopleNames(tx, [quote.createdBy]),
    tx.crmOpportunity.findFirst({ where: { id: quote.opportunityId }, select: { title: true } }),
    quoteItems(tx, quote.id),
  ]);
  return {
    code: quote.code,
    versionNumber: quote.versionNumber,
    issuedOn: printedDate(bogotaToday(at)),
    validUntil: printedDate(toCalendarDate(quote.validUntil)),
    company,
    client: parties.get(quote.partyId)?.name ?? 'Cliente',
    opportunity: opportunity?.title ?? '',
    preparedBy:
      quote.createdBy === null ? 'ARZA TECH' : (people.get(quote.createdBy) ?? 'ARZA TECH'),
    lines: items.map(documentLine),
    subtotal: moneyText(quote.subtotal.toString()),
    discountTotal: moneyText(quote.discountTotal.toString()),
    taxes: taxesOf(items).map((tax) => ({ taxRate: tax.tax_rate, base: tax.base, tax: tax.tax })),
    total: moneyText(quote.total.toString()),
    paymentTerms: quote.paymentTerms,
    deliveryTerms: quote.deliveryTerms,
    warranty: quote.warranty,
    notes: quote.notes,
  };
}

/** La página y su marco institucional. */
export async function quoteHtml(
  tx: TenantTransaction,
  quote: CrmQuote,
  at: Date,
): Promise<QuoteHtml> {
  const document = await documentOf(tx, quote, at);
  const reference = `${quote.code} v${String(quote.versionNumber)}`;
  return {
    index: printPage(`Propuesta comercial ${reference}`, quoteDocumentBody(document)),
    header: institutionalHeader(FORMAT, document.company),
    footer: institutionalFooter(document.company, reference),
    landscape: false,
  };
}
