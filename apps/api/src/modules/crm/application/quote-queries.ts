import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_QUOTE_VALID_DAYS,
  quoteTotals,
  type QuoteTaxLine,
  serviceUnitSchema,
  type DownloadLinkResponse,
  type QuoteDetail,
  type QuoteItem,
  type QuoteListQuery,
  type QuoteListResponse,
  type QuoteOptions,
  type QuoteSummary,
} from '@arza/contracts';

import type { CrmQuote, CrmQuoteItem, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, discountCapOn, toCalendarDate } from '../../core/index.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { taxRatesOn } from '../../fin/index.js';
import { commercialParties, matchingPartyIds } from '../../party/index.js';
import { moneyText } from '../domain/money.js';
import { pdfNotReady } from './crm-messages.js';
import { peopleNames, personRef } from './crm-support.js';
import { findQuote, quoteItems, statusOf } from './quote-records.js';
import { activeServices } from './services.js';

// Lista y ficha de las cotizaciones (B23), lo que necesita el asistente y el PDF para descargar.
// Por defecto la lista muestra solo la última versión de cada cotización.

interface QuoteContext {
  readonly opportunities: ReadonlyMap<string, { code: string; title: string }>;
  readonly parties: ReadonlyMap<string, { name: string; email: string | null }>;
  readonly people: ReadonlyMap<string, string>;
}

async function quoteContext(
  tx: TenantTransaction,
  quotes: readonly CrmQuote[],
): Promise<QuoteContext> {
  const [opportunities, parties, people] = await Promise.all([
    tx.crmOpportunity.findMany({
      where: { id: { in: [...new Set(quotes.map((quote) => quote.opportunityId))] } },
      select: { id: true, code: true, title: true },
    }),
    commercialParties(
      tx,
      quotes.map((quote) => quote.partyId),
    ),
    peopleNames(
      tx,
      quotes.flatMap((quote) => [quote.createdBy, quote.decidedBy]),
    ),
  ]);
  return {
    opportunities: new Map(opportunities.map((row) => [row.id, row])),
    parties,
    people,
  };
}

function summaryView(quote: CrmQuote, context: QuoteContext): QuoteSummary {
  const opportunity = context.opportunities.get(quote.opportunityId);
  return {
    id: quote.id,
    code: quote.code,
    version_number: quote.versionNumber,
    opportunity: {
      id: quote.opportunityId,
      code: opportunity?.code ?? '',
      title: opportunity?.title ?? '',
    },
    party: { id: quote.partyId, name: context.parties.get(quote.partyId)?.name ?? 'Cliente' },
    status: statusOf(quote),
    valid_until: toCalendarDate(quote.validUntil),
    total: moneyText(quote.total.toString()),
    author: personRef(context.people, quote.createdBy),
    sent_at: quote.sentAt?.toISOString() ?? null,
    created_at: quote.createdAt.toISOString(),
    version: quote.version,
  };
}

function itemView(item: CrmQuoteItem, serviceCodes: ReadonlyMap<string, string>): QuoteItem {
  return {
    id: item.id,
    position: item.position,
    service:
      item.serviceId === null
        ? null
        : { id: item.serviceId, code: serviceCodes.get(item.serviceId) ?? '' },
    description: item.description,
    unit: serviceUnitSchema.parse(item.unit),
    quantity: item.quantity.toFixed(2),
    unit_price: moneyText(item.unitPrice.toString()),
    discount_percent: item.discountPercent.toFixed(2),
    tax_key: item.taxKey,
    tax_rate: item.taxRate.toFixed(2),
    line_subtotal: moneyText(item.lineSubtotal.toString()),
    line_discount: moneyText(item.lineDiscount.toString()),
    line_tax: moneyText(item.lineTax.toString()),
    line_total: moneyText(item.lineTotal.toString()),
  };
}

/** Impuesto por tarifa de los ítems guardados, como lo muestran la ficha y el PDF. */
export function taxesOf(items: readonly CrmQuoteItem[]): readonly QuoteTaxLine[] {
  return quoteTotals(
    items.map((item) => ({
      quantity: item.quantity.toFixed(2),
      unit_price: item.unitPrice.toFixed(2),
      discount_percent: item.discountPercent.toFixed(2),
      tax_rate: item.taxRate.toFixed(2),
    })),
  ).taxes;
}

async function serviceCodesOf(
  tx: TenantTransaction,
  items: readonly CrmQuoteItem[],
): Promise<Map<string, string>> {
  const ids = items.flatMap((item) => (item.serviceId === null ? [] : [item.serviceId]));
  if (ids.length === 0) return new Map();
  const services = await tx.crmService.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, code: true },
  });
  return new Map(services.map((service) => [service.id, service.code]));
}

async function listWhere(
  tx: TenantTransaction,
  query: QuoteListQuery,
): Promise<Prisma.CrmQuoteWhereInput> {
  const where: Prisma.CrmQuoteWhereInput = {
    deletedAt: null,
    ...(query.view === 'latest' ? { next: { none: { deletedAt: null } } } : {}),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.opportunity_id === undefined ? {} : { opportunityId: query.opportunity_id }),
  };
  if (query.q === undefined) return where;
  const partyIds = await matchingPartyIds(tx, query.q);
  return {
    ...where,
    OR: [{ code: { contains: query.q.toUpperCase() } }, { partyId: { in: partyIds } }],
  };
}

function pdfView(quote: CrmQuote): QuoteDetail['pdf'] {
  const status =
    quote.pdfStatus === 'ready' || quote.pdfStatus === 'pending' ? quote.pdfStatus : 'none';
  return {
    status,
    file_name: status === 'ready' ? `${quote.code}-v${String(quote.versionNumber)}.pdf` : null,
  };
}

function approvalView(quote: CrmQuote, context: QuoteContext): QuoteDetail['approval'] {
  return {
    required: quote.requiresApproval,
    largest_discount: quote.largestDiscount.toFixed(2),
    discount_cap: quote.discountCap?.toFixed(2) ?? null,
    decided_by: personRef(context.people, quote.decidedBy),
    decided_at: quote.decidedAt?.toISOString() ?? null,
    note: quote.decisionNote,
  };
}

function recipientView(quote: CrmQuote): QuoteDetail['recipient'] {
  const { recipientName: name, recipientEmail: email } = quote;
  return name === null || email === null ? null : { name, email };
}

function versionView(version: CrmQuote): QuoteDetail['versions'][number] {
  return {
    id: version.id,
    version_number: version.versionNumber,
    status: statusOf(version),
    total: moneyText(version.total.toString()),
    created_at: version.createdAt.toISOString(),
  };
}

function responseView(quote: CrmQuote): QuoteDetail['response'] {
  if (
    quote.respondedAt === null ||
    (quote.response !== 'accepted' && quote.response !== 'rejected')
  ) {
    return null;
  }
  return {
    decision: quote.response,
    at: quote.respondedAt.toISOString(),
    by_name: quote.respondedByName,
    reason: quote.responseReason,
    ip: quote.responseIp,
    user_agent: quote.responseUserAgent,
    pdf_sha256: quote.responsePdfSha256,
  };
}

@Injectable()
export class QuoteQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  /** Las más recientes primero. */
  async list(principal: Principal, query: QuoteListQuery): Promise<QuoteListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.crmQuote.findMany({
        where: await listWhere(tx, query),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const context = await quoteContext(tx, page);
      return {
        data: page.map((row) => summaryView(row, context)),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async detail(principal: Principal, id: string): Promise<QuoteDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const quote = await findQuote(tx, id);
      const [context, items, versions] = await Promise.all([
        quoteContext(tx, [quote]),
        quoteItems(tx, quote.id),
        tx.crmQuote.findMany({
          where: { code: quote.code, deletedAt: null },
          orderBy: { versionNumber: 'desc' },
        }),
      ]);
      const codes = await serviceCodesOf(tx, items);
      return {
        ...summaryView(quote, context),
        conditions: {
          payment_terms: quote.paymentTerms,
          delivery_terms: quote.deliveryTerms,
          warranty: quote.warranty,
        },
        notes: quote.notes,
        items: items.map((item) => itemView(item, codes)),
        subtotal: moneyText(quote.subtotal.toString()),
        discount_total: moneyText(quote.discountTotal.toString()),
        tax_total: moneyText(quote.taxTotal.toString()),
        taxes: [...taxesOf(items)],
        approval: approvalView(quote, context),
        recipient: recipientView(quote),
        email_sent_at: quote.emailSentAt?.toISOString() ?? null,
        response: responseView(quote),
        pdf: pdfView(quote),
        party_email: context.parties.get(quote.partyId)?.email ?? null,
        versions: versions.map(versionView),
      };
    });
  }

  /** Servicios activos, impuestos vigentes hoy y el tope de descuento, para el asistente. */
  async options(principal: Principal): Promise<QuoteOptions> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const [services, rates, cap] = await Promise.all([
        activeServices(tx),
        taxRatesOn(tx, today),
        discountCapOn(tx, today),
      ]);
      return {
        services,
        taxes: [...rates.values()].map((rate) => ({
          key: rate.key,
          label: rate.label,
          rate: rate.rate,
        })),
        discount_cap: cap?.percent ?? null,
        default_valid_days: DEFAULT_QUOTE_VALID_DAYS,
      };
    });
  }

  /** Enlace temporal para descargar el PDF FT-COM-001 de la versión. */
  async pdfLink(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const quote = await findQuote(tx, id);
      if (quote.pdfFileId === null) throw pdfNotReady();
      return this.links.issue(tx, principal, quote.pdfFileId, meta);
    });
  }
}
