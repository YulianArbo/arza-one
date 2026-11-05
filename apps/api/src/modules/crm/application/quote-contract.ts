import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { moneyText } from '../domain/money.js';
import { quoteItems } from './quote-records.js';

// La cotización aceptada como la usa Contratos (B24): el cliente, el valor, la forma de pago y lo
// cotizado, para proponer el contrato (numeral 13.3, crm.quote.accepted). Solo una aceptada sirve.

export interface ContractQuote {
  readonly id: string;
  readonly code: string;
  readonly versionNumber: number;
  readonly partyId: string;
  /** El asunto de la oportunidad. */
  readonly title: string;
  /** Lo cotizado, ítem por ítem. */
  readonly object: string;
  readonly total: string;
  readonly paymentTerms: string;
}

/** La cotización aceptada, o null si no existe o no está aceptada. */
export async function acceptedQuote(
  tx: TenantTransaction,
  quoteId: string,
): Promise<ContractQuote | null> {
  const quote = await tx.crmQuote.findFirst({
    where: { id: quoteId, status: 'accepted', deletedAt: null },
  });
  if (quote === null) return null;
  const [opportunity, items] = await Promise.all([
    tx.crmOpportunity.findFirst({ where: { id: quote.opportunityId }, select: { title: true } }),
    quoteItems(tx, quote.id),
  ]);
  return {
    id: quote.id,
    code: quote.code,
    versionNumber: quote.versionNumber,
    partyId: quote.partyId,
    title: opportunity?.title ?? quote.code,
    object: items.map((item) => item.description).join('; '),
    total: moneyText(quote.total.toString()),
    paymentTerms: quote.paymentTerms,
  };
}
