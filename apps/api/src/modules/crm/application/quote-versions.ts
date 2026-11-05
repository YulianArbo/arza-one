import {
  DEFAULT_QUOTE_VALID_DAYS,
  NEW_VERSION_FROM,
  type UpdateQuoteRequest,
} from '@arza/contracts';

import type { CrmQuote } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addDays, bogotaToday, toCalendarDate } from '../../core/index.js';
import { isPastValidity } from '../domain/quote-rules.js';
import { statusInvalid } from './crm-messages.js';
import { recordCrmChange, type CrmActor, type CrmTarget } from './crm-support.js';
import { assertOpen, findOpportunity } from './opportunity-records.js';
import {
  assertQuoteStatus,
  buildDraft,
  draftColumns,
  findQuote,
  itemRequestsOf,
  quoteAudit,
  quoteItems,
  replaceItems,
  updateQuoteVersioned,
} from './quote-records.js';

// Versión siguiente de una cotización (B23, ficha 17.6): una enviada no se edita, se crea una
// versión nueva. Copia la cotización como borrador, con las tarifas de impuestos de hoy. Una
// enviada o aprobada queda reemplazada y su enlace ya no sirve para aceptarla.

/** Sale de la última versión, en un estado que lo permite, de una oportunidad abierta. */
async function assertCanVersion(tx: TenantTransaction, source: CrmQuote): Promise<void> {
  assertQuoteStatus(
    source,
    NEW_VERSION_FROM,
    'La versión nueva sale de una cotización aprobada, enviada, rechazada o vencida.',
  );
  const newer = await tx.crmQuote.count({
    where: { code: source.code, versionNumber: { gt: source.versionNumber }, deletedAt: null },
  });
  if (newer > 0) throw statusInvalid('Ya existe una versión más reciente de esta cotización.');
  assertOpen(await findOpportunity(tx, source.opportunityId));
}

/** El contenido de la versión anterior; si su vigencia ya pasó, la nueva propone otra. */
async function copyOf(
  tx: TenantTransaction,
  source: CrmQuote,
  at: Date,
): Promise<UpdateQuoteRequest> {
  const today = bogotaToday(at);
  const sourceUntil = toCalendarDate(source.validUntil);
  return {
    valid_until: isPastValidity(sourceUntil, today)
      ? addDays(today, DEFAULT_QUOTE_VALID_DAYS)
      : sourceUntil,
    conditions: {
      payment_terms: source.paymentTerms,
      delivery_terms: source.deliveryTerms,
      warranty: source.warranty,
    },
    notes: source.notes,
    items: itemRequestsOf(await quoteItems(tx, source.id)),
  };
}

/** Crea la versión siguiente y devuelve su id. */
export async function createNextVersion(
  tx: TenantTransaction,
  actor: CrmActor,
  target: CrmTarget,
): Promise<string> {
  const source = await findQuote(tx, target.id);
  await assertCanVersion(tx, source);
  if (source.status === 'approved' || source.status === 'sent') {
    await updateQuoteVersioned(tx, target, { status: 'superseded', closedAt: actor.at });
  } else if (source.version !== target.version) {
    throw versionConflict();
  }
  const input = await copyOf(tx, source, actor.at);
  const built = await buildDraft(tx, input.items, actor.at);
  const versionNumber = source.versionNumber + 1;
  const quote = await tx.crmQuote.create({
    data: {
      tenantId: actor.tenantId,
      code: source.code,
      versionNumber,
      previousId: source.id,
      opportunityId: source.opportunityId,
      partyId: source.partyId,
      ...draftColumns(input, built),
    },
  });
  await replaceItems(tx, quote, built, actor.at);
  await recordCrmChange(tx, actor, {
    action: 'crm.quote.new_version',
    event: 'crm.quote.versioned',
    entityType: 'crm_quote',
    entityId: quote.id,
    changes: { ...quoteAudit(quote), previous_id: source.id, previous_status: source.status },
    payload: { code: source.code, version_number: versionNumber, previous_id: source.id },
  });
  return quote.id;
}
