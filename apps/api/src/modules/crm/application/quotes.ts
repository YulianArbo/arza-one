import { Inject, Injectable } from '@nestjs/common';
import {
  exceedsDiscountCap,
  type ApproveQuoteRequest,
  type CreateQuoteRequest,
  type ReturnQuoteRequest,
  type SendQuoteRequest,
  type UpdateQuoteRequest,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, discountCapOn, nextBusinessCode, toCalendarDate } from '../../core/index.js';
import { QUOTE_FLOW_ACTIONS } from '../domain/crm-flows.js';
import { isPastValidity } from '../domain/quote-rules.js';
import { pdfNotReady, quoteExpired } from './crm-messages.js';
import { crmActorOf, recordCrmChange, type CrmActor, type CrmTarget } from './crm-support.js';
import { assertOpen, findOpportunity } from './opportunity-records.js';
import {
  approveQuote,
  assertNotAuthor,
  closeApprovalTask,
  quoteEventPayload,
  returnQuote,
  startQuoteApproval,
  type QuoteRequester,
} from './quote-flow.js';
import {
  QUOTES,
  QUOTE_SEQUENCE,
  assertQuoteStatus,
  assertValidUntil,
  buildDraft,
  draftColumns,
  findQuote,
  quoteAudit,
  replaceItems,
  updateQuoteVersioned,
} from './quote-records.js';
import { createNextVersion } from './quote-versions.js';

const DRAFT_ONLY =
  'Solo un borrador se edita. Una cotización enviada no se edita: cree una versión nueva.';

/** Cotizaciones (B23, ficha 17.6): borrador, aprobación, envío y versiones. */
@Injectable()
export class QuotesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CrmActor {
    return crmActorOf(principal, meta, this.clock.now());
  }

  /** Borrador nuevo de una oportunidad abierta, con su código COT-AAAA-NNNN y la versión 1. */
  async create(
    principal: Principal,
    input: CreateQuoteRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const opportunity = await findOpportunity(tx, input.opportunity_id);
      assertOpen(opportunity);
      assertValidUntil(input.valid_until, actor.at);
      const built = await buildDraft(tx, input.items, actor.at);
      const code = await nextBusinessCode(tx, QUOTE_SEQUENCE, actor.at, QUOTES);
      const quote = await tx.crmQuote.create({
        data: {
          tenantId: actor.tenantId,
          code,
          versionNumber: 1,
          opportunityId: opportunity.id,
          partyId: opportunity.partyId,
          ...draftColumns(input, built),
        },
      });
      await replaceItems(tx, quote, built, actor.at);
      await recordCrmChange(tx, actor, {
        action: 'crm.quote.create',
        event: 'crm.quote.created',
        entityType: 'crm_quote',
        entityId: quote.id,
        changes: {
          ...quoteAudit(quote),
          opportunity_id: opportunity.id,
          items: built.items.length,
        },
        payload: { code, opportunity_id: opportunity.id, version_number: 1 },
      });
      return quote.id;
    });
  }

  /** Guarda el borrador completo: encabezado e ítems, recalculados con las tarifas de hoy. */
  async update(
    principal: Principal,
    target: CrmTarget,
    input: UpdateQuoteRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findQuote(tx, target.id);
      assertQuoteStatus(before, ['draft'], DRAFT_ONLY);
      assertValidUntil(input.valid_until, actor.at);
      const built = await buildDraft(tx, input.items, actor.at);
      await updateQuoteVersioned(tx, target, draftColumns(input, built));
      await replaceItems(tx, before, built, actor.at);
      const after = await findQuote(tx, target.id);
      await recordCrmChange(tx, actor, {
        action: 'crm.quote.update',
        event: 'crm.quote.updated',
        entityType: 'crm_quote',
        entityId: target.id,
        changes: {
          code: before.code,
          ...changesBetween(quoteAudit(before), quoteAudit(after)),
          items: built.items.length,
        },
      });
    });
  }

  /**
   * Pide el envío. Si algún descuento pasa el tope vigente, va a la Dirección; si no, queda
   * aprobada y el worker prepara su PDF.
   */
  async submit(principal: Principal, target: CrmTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const quote = await findQuote(tx, target.id);
      assertQuoteStatus(quote, ['draft'], 'Solo se pide el envío de un borrador.');
      assertValidUntil(toCalendarDate(quote.validUntil), actor.at);
      const cap = (await discountCapOn(tx, bogotaToday(actor.at)))?.percent ?? '0';
      const lines = [{ discount_percent: quote.largestDiscount.toFixed(2) }];
      const needsApproval = exceedsDiscountCap(lines, cap);
      await updateQuoteVersioned(tx, target, {
        status: needsApproval ? 'in_approval' : 'approved',
        pdfStatus: needsApproval ? 'none' : 'pending',
        submittedAt: actor.at,
        discountCap: cap,
        requiresApproval: needsApproval,
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
      });
      if (needsApproval) await startQuoteApproval(tx, actor, quote);
      await recordCrmChange(tx, actor, {
        action: 'crm.quote.submit',
        event: needsApproval ? 'crm.quote.submitted' : 'crm.quote.approved',
        entityType: 'crm_quote',
        entityId: quote.id,
        changes: {
          ...quoteAudit(quote),
          status: ['draft', needsApproval ? 'in_approval' : 'approved'],
          discount_cap: cap,
          requires_approval: needsApproval,
        },
        payload: quoteEventPayload(quote),
      });
    });
  }

  async approve(
    requester: QuoteRequester,
    target: CrmTarget,
    input: ApproveQuoteRequest,
  ): Promise<void> {
    await this.decide(requester, target, QUOTE_FLOW_ACTIONS.approve, input.comment);
  }

  async returnToDraft(
    requester: QuoteRequester,
    target: CrmTarget,
    input: ReturnQuoteRequest,
  ): Promise<void> {
    await this.decide(requester, target, QUOTE_FLOW_ACTIONS.return, input.comment);
  }

  /** La Dirección decide desde la ficha: la cotización cambia y la tarea se cierra con ella. */
  private async decide(
    requester: QuoteRequester,
    target: CrmTarget,
    action: string,
    comment: string | null,
  ): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const quote = await findQuote(tx, target.id);
      if (quote.version !== target.version) throw versionConflict();
      assertQuoteStatus(quote, ['in_approval'], 'La cotización no está esperando aprobación.');
      assertNotAuthor(quote, actor.userId, null);
      if (action === QUOTE_FLOW_ACTIONS.approve) {
        await approveQuote(tx, actor, quote, comment);
      } else {
        await returnQuote(tx, actor, quote, comment ?? 'Devuelta para corregir.');
      }
      await closeApprovalTask(tx, actor, requester, quote.workflowInstanceId, { action, comment });
    });
  }

  /** Envía la cotización aprobada: el worker manda el correo con el enlace (anexo D). */
  async send(
    principal: Principal,
    target: CrmTarget,
    input: SendQuoteRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const quote = await findQuote(tx, target.id);
      assertQuoteStatus(quote, ['approved'], 'Solo se envía una cotización aprobada.');
      if (quote.pdfStatus !== 'ready') throw pdfNotReady();
      const validUntil = toCalendarDate(quote.validUntil);
      if (isPastValidity(validUntil, bogotaToday(actor.at))) throw quoteExpired(validUntil);
      await updateQuoteVersioned(tx, target, {
        status: 'sent',
        sentAt: actor.at,
        sentBy: actor.userId,
        recipientName: input.recipient_name,
        recipientEmail: input.recipient_email,
        emailSentAt: null,
      });
      await recordCrmChange(tx, actor, {
        action: 'crm.quote.send',
        event: 'crm.quote.sent',
        entityType: 'crm_quote',
        entityId: quote.id,
        changes: {
          ...quoteAudit(quote),
          status: ['approved', 'sent'],
          recipient_name: input.recipient_name,
          recipient_email: input.recipient_email,
        },
        payload: { code: quote.code, version_number: quote.versionNumber },
      });
    });
  }

  /** Versión siguiente: copia la cotización como borrador (quote-versions.ts). */
  async newVersion(principal: Principal, target: CrmTarget, meta: RequestMeta): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, (tx) => createNextVersion(tx, actor, target));
  }
}
