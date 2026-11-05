import { EXPIRY_ALERT_DAYS } from './common.js';

// Vencimiento de los contratos (B24, ficha 17.7): las alertas salen a 90, 60 y 30 días del fin.
// Si la plataforma no avisó a tiempo (un contrato que se firmó ya cerca de su fin), avisa una sola
// vez con el umbral más cercano, sin repetir los anteriores.

const DAY_MS = 86_400_000;

/** Días de calendario desde hoy hasta la fecha (negativo si ya pasó). Fechas AAAA-MM-DD. */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * El umbral que toca avisar hoy, o null si no toca: el menor umbral que ya se alcanzó y que es
 * menor que el último avisado.
 */
export function expiryAlertDue(daysLeft: number, lastAlertDays: number | null): number | null {
  if (daysLeft < 0) return null;
  const reached = EXPIRY_ALERT_DAYS.filter((days) => daysLeft <= days);
  const nearest = reached.at(-1);
  if (nearest === undefined) return null;
  return lastAlertDays === null || nearest < lastAlertDays ? nearest : null;
}
