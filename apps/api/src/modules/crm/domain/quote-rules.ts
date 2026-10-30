import type { PublicQuoteState, QuoteStatus } from '@arza/contracts';

// Reglas de la cotización que no dependen de la base de datos (B23, ficha 17.6).

/** Desfase de Colombia frente a UTC: no tiene horario de verano. */
const BOGOTA_OFFSET_HOURS = 5;

/**
 * El enlace del cliente vence con la vigencia (anexo D): sirve hasta las 11:59 p. m. de Colombia
 * del último día. Devuelve el primer instante en que ya no sirve.
 */
export function linkExpiresAt(validUntil: string): Date {
  const [year = 0, month = 1, day = 1] = validUntil.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, BOGOTA_OFFSET_HOURS));
}

/** La vigencia ya pasó: hoy (en Colombia) es posterior a su último día. */
export function isPastValidity(validUntil: string, today: string): boolean {
  return today > validUntil;
}

/** Lo que el cliente ve al abrir el enlace, según el estado y la fecha. */
export function publicStateOf(
  status: QuoteStatus,
  validUntil: string,
  today: string,
): PublicQuoteState {
  if (status === 'accepted' || status === 'rejected') return status;
  if (status === 'superseded') return 'replaced';
  if (status === 'expired' || isPastValidity(validUntil, today)) return 'expired';
  return 'open';
}
