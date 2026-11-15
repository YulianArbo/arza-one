import {
  isHigherTier,
  minQuotesOf,
  purchaseTierOf,
  type PurchaseTier,
  type PurchaseTiers,
} from '@arza/contracts';

// Reglas de Compras (B33) que no dependen de la base de datos: qué valor manda para aprobar, quién
// puede aprobarlo y qué pasa al elegir una cotización en el cuadro comparativo.

/** El valor que manda: el de la cotización elegida o, si aún no hay, el estimado. */
export function approvalAmountOf(estimated: string, selectedQuote: string | null): string {
  return selectedQuote ?? estimated;
}

/** El tramo alto lo aprueba solo quien tiene el permiso de la Dirección. */
export function canApproveTier(tier: PurchaseTier, hasHighApproval: boolean): boolean {
  return tier !== 'high' || hasHighApproval;
}

export interface QuoteSelection {
  /** Valor con que se aprobó la solicitud. */
  readonly approvedAmount: string;
  /** Valor de la cotización que se quiere elegir. */
  readonly quoteAmount: string;
  /** Cotizaciones vigentes de la solicitud. */
  readonly quoteCount: number;
  readonly tiers: PurchaseTiers;
}

export type QuoteSelectionOutcome =
  | { readonly kind: 'quotes_missing'; readonly required: number }
  /** La cotización cae en un tramo mayor que el aprobado: vuelve a aprobación (decisión 5). */
  | { readonly kind: 'needs_approval' }
  | { readonly kind: 'quoted' };

/**
 * Elegir una cotización exige las cotizaciones mínimas del tramo de su valor. Si ese tramo es mayor
 * que el del valor aprobado, la solicitud vuelve a aprobación del nivel que corresponde: nadie
 * evita a la Dirección subestimando el valor.
 */
export function quoteSelectionOutcome(selection: QuoteSelection): QuoteSelectionOutcome {
  const tier = purchaseTierOf(selection.quoteAmount, selection.tiers);
  const required = minQuotesOf(tier, selection.tiers);
  if (selection.quoteCount < required) return { kind: 'quotes_missing', required };
  const approvedTier = purchaseTierOf(selection.approvedAmount, selection.tiers);
  return isHigherTier(tier, approvedTier) ? { kind: 'needs_approval' } : { kind: 'quoted' };
}

/** Una recepción no puede tener fecha futura ni anterior a la emisión de la orden. */
export function receiptDateProblem(
  receivedOn: string,
  issuedOn: string,
  today: string,
): 'future' | 'before_order' | null {
  if (receivedOn > today) return 'future';
  return receivedOn < issuedOn ? 'before_order' : null;
}
