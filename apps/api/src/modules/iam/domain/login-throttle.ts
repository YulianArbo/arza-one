// Espera progresiva y bloqueo (numeral 15.1): cada intento fallido obliga a esperar el doble que
// el anterior (1, 2, 4 y 8 segundos) y el quinto bloquea 15 minutos. La regla se aplica al correo,
// exista o no la cuenta, para que el comportamiento no revele cuáles existen.

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** Los fallos se cuentan en esta ventana, desde el último acierto. */
export const FAILURE_WINDOW_MS = 15 * MINUTE_MS;
export const FAILURES_TO_LOCK = 5;
export const LOCK_DURATION_MS = 15 * MINUTE_MS;

export interface RecentFailures {
  readonly count: number;
  readonly lastFailureAt: Date | null;
}

export type LoginGate =
  | { readonly kind: 'open' }
  | { readonly kind: 'delayed'; readonly retryAfterSeconds: number }
  | { readonly kind: 'locked'; readonly retryAfterSeconds: number };

/** Segundos que hay que esperar después de un número de fallos seguidos (1 → 1 s, 4 → 8 s). */
export function delayAfterFailures(failures: number): number {
  return failures <= 0 ? 0 : 2 ** (Math.min(failures, FAILURES_TO_LOCK - 1) - 1);
}

function secondsUntil(moment: number, now: Date): number {
  return Math.max(1, Math.ceil((moment - now.getTime()) / SECOND_MS));
}

/** Instante en que termina el bloqueo, o null si los fallos no alcanzan a bloquear. */
export function lockedUntil(failures: RecentFailures): Date | null {
  if (failures.count < FAILURES_TO_LOCK || failures.lastFailureAt === null) return null;
  return new Date(failures.lastFailureAt.getTime() + LOCK_DURATION_MS);
}

/**
 * Decide si se puede evaluar un intento ahora. El bloqueo guardado en la cuenta (por ejemplo, de
 * otra réplica de la API) también cuenta.
 */
export function loginGate(
  failures: RecentFailures,
  accountLockedUntil: Date | null,
  now: Date,
): LoginGate {
  const until = [lockedUntil(failures), accountLockedUntil]
    .filter((moment): moment is Date => moment !== null && moment > now)
    .map((moment) => moment.getTime());
  if (until.length > 0) {
    return { kind: 'locked', retryAfterSeconds: secondsUntil(Math.max(...until), now) };
  }
  if (failures.lastFailureAt === null || failures.count >= FAILURES_TO_LOCK)
    return { kind: 'open' };
  const allowedAt =
    failures.lastFailureAt.getTime() + delayAfterFailures(failures.count) * SECOND_MS;
  if (allowedAt > now.getTime()) {
    return { kind: 'delayed', retryAfterSeconds: secondsUntil(allowedAt, now) };
  }
  return { kind: 'open' };
}
