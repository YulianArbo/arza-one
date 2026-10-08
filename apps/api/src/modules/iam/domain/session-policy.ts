// Vencimiento de las sesiones (numeral 15.1): 8 horas sin uso o 12 horas en total.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const SESSION_IDLE_MS = 8 * HOUR_MS;
export const SESSION_ABSOLUTE_MS = 12 * HOUR_MS;
/** La última actividad se guarda como mucho una vez por minuto, no en cada petición. */
export const SESSION_TOUCH_INTERVAL_MS = MINUTE_MS;

export function sessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_MS);
}

export function isIdleExpired(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_IDLE_MS;
}

export function shouldTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
