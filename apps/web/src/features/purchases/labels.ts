import type {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  PurchaseTier,
  SupplierEvaluationResult,
  TravelStatus,
} from '@arza/contracts';

// Textos de Compras (B33) en español de Colombia.

export const REQUEST_STATUS: Record<PurchaseRequestStatus, string> = {
  draft: 'Borrador',
  in_approval: 'En aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  quoted: 'Cotizada',
  ordered: 'Ordenada',
  received: 'Recibida',
  closed: 'Cerrada',
};

export const ORDER_STATUS: Record<PurchaseOrderStatus, string> = {
  issued: 'Emitida',
  received: 'Recibida',
  closed: 'Cerrada',
};

export const TIER_LABELS: Record<PurchaseTier, string> = {
  low: 'Tramo bajo',
  mid: 'Tramo medio',
  high: 'Tramo alto (Dirección)',
};

export const TRAVEL_STATUS_LABELS: Record<TravelStatus, string> = {
  draft: 'Borrador',
  in_approval: 'En aprobación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  legalized: 'Legalizado',
};

export const EVALUATION_KINDS = { selection: 'Selección', reevaluation: 'Reevaluación' } as const;

export const EVALUATION_RESULTS: Record<SupplierEvaluationResult, string> = {
  approved: 'Aprobado',
  conditional: 'Condicionado',
  rejected: 'No aprobado',
};

export const CRITERIA_LABELS = {
  quality: 'Calidad',
  compliance: 'Cumplimiento',
  price: 'Precio',
  service: 'Servicio',
} as const;

/** «1 cotización» o «3 cotizaciones». */
export function quotesText(count: number): string {
  return count === 1 ? '1 cotización' : `${String(count)} cotizaciones`;
}

/** «4.25» → «4,25». */
export function scoreText(score: string): string {
  return score.replace('.', ',');
}
