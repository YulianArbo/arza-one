import type { DueDiligenceState } from '@arza/contracts';

// Conocimiento del tercero (ficha 17.3): vigencia de la aprobación y estado que muestra la ficha.

/** Meses entre una aprobación y la siguiente revisión, si quien aprueba no fija otra fecha. */
export const REVIEW_MONTHS = 12;

/** Misma fecha doce meses después; el 29 de febrero pasa al 28 si el año no es bisiesto. */
export function defaultNextReview(today: string): string {
  const [year, month, day] = today.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Fecha inválida: ${today}`);
  }
  const target = new Date(Date.UTC(year, month - 1 + REVIEW_MONTHS, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  target.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return target.toISOString().slice(0, 10);
}

export interface LatestReview {
  readonly status: string;
  readonly nextReviewOn: string | null;
}

/**
 * Estado del conocimiento del tercero según el último registrado. Uno aprobado cuya fecha de
 * revisión ya pasó está vencido: el tercero deja de estar apto hasta que se apruebe otro.
 */
export function dueDiligenceState(latest: LatestReview | null, today: string): DueDiligenceState {
  if (latest === null) return 'none';
  if (latest.status === 'pending' || latest.status === 'rejected') return latest.status;
  return latest.nextReviewOn !== null && latest.nextReviewOn >= today ? 'approved' : 'expired';
}

export type ReviewProblem = 'same_person' | 'closed';

/**
 * Quién puede revisar: solo una persona distinta de quien registró (doble aprobación, numeral
 * 15.4, segregación) y solo mientras la revisión esté pendiente.
 */
export function reviewProblem(
  review: { readonly status: string; readonly createdBy: string | null },
  reviewerId: string,
): ReviewProblem | null {
  if (review.status !== 'pending') return 'closed';
  return review.createdBy === reviewerId ? 'same_person' : null;
}
