import { addDays } from './calendar-date.js';

// Vigencias de un parámetro (ficha 17.1): nunca se sobrescriben ni se reescribe el pasado. Una
// vigencia nueva empieza hoy o más adelante, después de la última, y cierra la anterior el día
// antes de empezar.

export type ValidFromProblem = 'in_past' | 'not_after_latest';

export function validFromProblem(
  validFrom: string,
  today: string,
  latestValidFrom: string | null,
): ValidFromProblem | null {
  if (validFrom < today) return 'in_past';
  if (latestValidFrom !== null && validFrom <= latestValidFrom) return 'not_after_latest';
  return null;
}

/** Último día de la vigencia anterior. */
export function previousValidTo(validFrom: string): string {
  return addDays(validFrom, -1);
}

interface Validity {
  readonly validFrom: string;
  readonly validTo: string | null;
}

/** La vigencia de hoy y la que empieza más adelante, si las hay. */
export function currentAndScheduled<T extends Validity>(
  versions: readonly T[],
  today: string,
): { current: T | null; scheduled: T | null } {
  const current = versions.find(
    (v) => v.validFrom <= today && (v.validTo === null || v.validTo >= today),
  );
  const scheduled = versions.find((v) => v.validFrom > today);
  return { current: current ?? null, scheduled: scheduled ?? null };
}
