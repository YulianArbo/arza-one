import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  serviceUnitSchema,
  type AcceptQuoteRequest,
  type PublicQuote,
  type RejectQuoteRequest,
} from '@arza/contracts';

import type { CrmQuote, CrmQuoteItem } from '../../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, companyIdentity, toCalendarDate } from '../../core/index.js';
import { FileStorage, openAvailableFile, type OpenedFile } from '../../doc/index.js';
import { commercialParties } from '../../party/index.js';
import { moneyText } from '../domain/money.js';
import { publicStateOf } from '../domain/quote-rules.js';
import { quoteExpired, quoteLinkInvalid, statusInvalid } from './crm-messages.js';
import { recordCrmChange, type CrmActor } from './crm-support.js';
import { quoteEventPayload } from './quote-flow.js';
import { taxesOf } from './quote-queries.js';
import { quoteAudit, quoteItems, statusOf } from './quote-records.js';

// El cliente abre la cotización desde el enlace del correo, sin sesión (B23, anexo D). La API solo
// conoce la huella de la llave: con ella encuentra la empresa y la cotización y todo lo demás se
// lee dentro de esa empresa, con su seguridad por fila. Aceptar o rechazar deja la evidencia:
// fecha y hora, dirección IP, navegador, versión y la huella del PDF que el cliente tenía.

interface LinkTarget {
  readonly tenantId: string;
  readonly quoteId: string;
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Quien responde en el enlace no tiene usuario: lo identifican la IP y el navegador. */
function clientActor(target: LinkTarget, meta: RequestMeta, at: Date): CrmActor {
  return { tenantId: target.tenantId, userId: null, meta, at };
}

@Injectable()
export class PublicQuotesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  private async resolve(token: string): Promise<LinkTarget> {
    const rows = await this.database.withoutTenant(
      (tx) =>
        tx.$queryRaw<
          { quote_id: string; tenant_id: string }[]
        >`SELECT quote_id, tenant_id FROM crm_find_quote_link(${hashOf(token)})`,
    );
    const row = rows[0];
    if (row === undefined) throw quoteLinkInvalid();
    return { tenantId: row.tenant_id, quoteId: row.quote_id };
  }

  private async inQuote<T>(
    target: LinkTarget,
    work: (tx: TenantTransaction, quote: CrmQuote) => Promise<T>,
  ): Promise<T> {
    return this.database.withTenant({ tenantId: target.tenantId, userId: null }, async (tx) => {
      const quote = await tx.crmQuote.findFirst({ where: { id: target.quoteId, deletedAt: null } });
      if (quote === null) throw quoteLinkInvalid();
      if (quote.sentAt === null) throw quoteLinkInvalid();
      return work(tx, quote);
    });
  }

  /** La cotización como la ve el cliente; queda registrado que la abrió. */
  async view(token: string, meta: RequestMeta): Promise<PublicQuote> {
    const target = await this.resolve(token);
    const at = this.clock.now();
    return this.inQuote(target, async (tx, quote) => {
      const view = await publicView(tx, quote, bogotaToday(at));
      await auditOpening(tx, clientActor(target, meta, at), quote, 'view');
      return view;
    });
  }

  /** El PDF FT-COM-001 de la versión; queda registrado que el cliente lo descargó. */
  async pdf(token: string, meta: RequestMeta): Promise<OpenedFile> {
    const target = await this.resolve(token);
    const at = this.clock.now();
    return this.inQuote(target, async (tx, quote) => {
      const file =
        quote.pdfFileId === null
          ? null
          : await openAvailableFile(tx, this.storage, quote.pdfFileId);
      if (file === null) throw quoteLinkInvalid();
      await auditOpening(tx, clientActor(target, meta, at), quote, 'download');
      return file;
    });
  }

  async accept(input: AcceptQuoteRequest, meta: RequestMeta): Promise<void> {
    await this.respond(input.token, meta, {
      decision: 'accepted',
      name: input.accepted_by_name,
      reason: null,
    });
  }

  async reject(input: RejectQuoteRequest, meta: RequestMeta): Promise<void> {
    await this.respond(input.token, meta, {
      decision: 'rejected',
      name: null,
      reason: input.reason,
    });
  }

  /** Una sola respuesta, mientras la cotización siga enviada y vigente. */
  private async respond(token: string, meta: RequestMeta, answer: Answer): Promise<void> {
    const target = await this.resolve(token);
    const at = this.clock.now();
    await this.inQuote(target, async (tx, quote) => {
      assertAnswerable(quote, at);
      const { count } = await tx.crmQuote.updateMany({
        where: { id: quote.id, status: 'sent' },
        data: {
          status: answer.decision,
          response: answer.decision,
          respondedAt: at,
          respondedByName: answer.name,
          responseReason: answer.reason,
          responseIp: meta.ip,
          responseUserAgent: meta.userAgent,
          responsePdfSha256: quote.pdfSha256,
          closedAt: at,
        },
      });
      if (count === 0) throw statusInvalid('Esta cotización ya fue respondida.');
      await auditAnswer(tx, clientActor(target, meta, at), quote, answer);
    });
  }
}

/** Evidencia de que el cliente abrió la cotización o descargó su PDF, con su IP y navegador. */
async function auditOpening(
  tx: TenantTransaction,
  actor: CrmActor,
  quote: CrmQuote,
  kind: 'view' | 'download',
): Promise<void> {
  await recordCrmChange(tx, actor, {
    action: kind === 'view' ? 'crm.quote.client_view' : 'crm.quote.client_download',
    event: kind === 'view' ? 'crm.quote.viewed' : 'crm.quote.downloaded',
    entityType: 'crm_quote',
    entityId: quote.id,
    changes: { code: quote.code, version_number: quote.versionNumber, status: quote.status },
  });
}

interface Answer {
  readonly decision: 'accepted' | 'rejected';
  readonly name: string | null;
  readonly reason: string | null;
}

/** Sigue enviada y vigente; una vencida responde QUOTE_EXPIRED (numeral 14.2). */
function assertAnswerable(quote: CrmQuote, at: Date): void {
  const validUntil = toCalendarDate(quote.validUntil);
  const state = publicStateOf(statusOf(quote), validUntil, bogotaToday(at));
  if (state === 'expired') throw quoteExpired(validUntil);
  if (state !== 'open') {
    throw statusInvalid('Esta cotización ya fue respondida o se reemplazó por una versión nueva.');
  }
}

async function auditAnswer(
  tx: TenantTransaction,
  actor: CrmActor,
  quote: CrmQuote,
  answer: Answer,
): Promise<void> {
  const accepted = answer.decision === 'accepted';
  await recordCrmChange(tx, actor, {
    action: accepted ? 'crm.quote.accept' : 'crm.quote.reject',
    event: accepted ? 'crm.quote.accepted' : 'crm.quote.rejected',
    entityType: 'crm_quote',
    entityId: quote.id,
    changes: {
      ...quoteAudit(quote),
      status: ['sent', answer.decision],
      responded_by_name: answer.name,
      reason: answer.reason,
      pdf_sha256: quote.pdfSha256,
    },
    // crm.quote.accepted lo consumirá Contratos (M06, numeral 13.3) para proponer el contrato.
    payload: {
      ...quoteEventPayload(quote),
      opportunity_id: quote.opportunityId,
      party_id: quote.partyId,
    },
  });
}

function publicItem(item: CrmQuoteItem): PublicQuote['items'][number] {
  return {
    position: item.position,
    description: item.description,
    unit: serviceUnitSchema.parse(item.unit),
    quantity: item.quantity.toFixed(2),
    unit_price: moneyText(item.unitPrice.toString()),
    discount_percent: item.discountPercent.toFixed(2),
    tax_rate: item.taxRate.toFixed(2),
    line_total: moneyText(item.lineTotal.toString()),
  };
}

/** La cotización como la ve el cliente: sin datos internos (autor, aprobación, IP). */
async function publicView(
  tx: TenantTransaction,
  quote: CrmQuote,
  today: string,
): Promise<PublicQuote> {
  const [company, parties, items] = await Promise.all([
    companyIdentity(tx),
    commercialParties(tx, [quote.partyId]),
    quoteItems(tx, quote.id),
  ]);
  const validUntil = toCalendarDate(quote.validUntil);
  return {
    company: { name: company.legalName, tax_id: company.taxId },
    code: quote.code,
    version_number: quote.versionNumber,
    party_name: parties.get(quote.partyId)?.name ?? 'Cliente',
    issued_at: (quote.sentAt ?? quote.createdAt).toISOString(),
    valid_until: validUntil,
    state: publicStateOf(statusOf(quote), validUntil, today),
    conditions: {
      payment_terms: quote.paymentTerms,
      delivery_terms: quote.deliveryTerms,
      warranty: quote.warranty,
    },
    notes: quote.notes,
    items: items.map(publicItem),
    subtotal: moneyText(quote.subtotal.toString()),
    discount_total: moneyText(quote.discountTotal.toString()),
    tax_total: moneyText(quote.taxTotal.toString()),
    total: moneyText(quote.total.toString()),
    taxes: [...taxesOf(items)],
    responded_at: quote.respondedAt?.toISOString() ?? null,
    responded_by: quote.respondedByName,
  };
}
