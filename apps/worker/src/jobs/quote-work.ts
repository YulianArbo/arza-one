import {
  expireQuotes,
  processPendingQuotes,
  type QuoteWorkDependencies,
  type QuoteWorkResult,
} from '@arza/api/crm';

export type QuoteWorkJobDependencies = QuoteWorkDependencies;

/**
 * Cotizaciones (B23), en el módulo del CRM: el PDF FT-COM-001 de cada versión aprobada y el correo
 * con el enlace de cada cotización enviada. Repetirlo no cambia nada; si Gotenberg, el
 * almacenamiento o el correo no responden, lo pendiente queda para la siguiente pasada.
 */
export async function processQuoteWork(deps: QuoteWorkJobDependencies): Promise<QuoteWorkResult> {
  return processPendingQuotes(deps);
}

/** Vence las cotizaciones enviadas cuya vigencia pasó (ficha 17.6). Devuelve cuántas venció. */
export async function processQuoteExpire(deps: QuoteWorkJobDependencies): Promise<number> {
  return expireQuotes(deps);
}
